import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, cpSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { createDetachedAgentSessionHost } from '../framework/agent-session/src/product-client.mjs';

const PROFILE_ROOT = `sha256:${'8'.repeat(64)}`;
const PRIVATE_ENV_NAMES = new Set(['ANTHROPIC_API_KEY', 'OPENAI_API_KEY']);
const require = createRequire(
  new URL('../framework/agent-session/package.json', import.meta.url),
);

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requiredArgument(name) {
  const value = argument(name);
  if (!value) throw new Error(`${name} is required`);
  return path.resolve(value);
}

async function eventually(probe, label, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await probe();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(
    `${label} did not converge${lastError ? `: ${lastError.message}` : ''}`,
  );
}

function environment() {
  const selected = {};
  for (const name of [
    'HOME',
    'PATH',
    'SHELL',
    'TERM',
    'LANG',
    'LC_ALL',
    'USER',
    'LOGNAME',
    'TMPDIR',
    'CODEX_HOME',
    'CLAUDE_CONFIG_DIR',
    ...PRIVATE_ENV_NAMES,
  ]) {
    if (typeof process.env[name] === 'string')
      selected[name] = process.env[name];
  }
  selected.TERM = 'xterm-256color';
  selected.LANG ??= 'C.UTF-8';
  return selected;
}

function providerArguments(provider) {
  return provider === 'codex'
    ? [
        '--no-alt-screen',
        '--sandbox',
        'read-only',
        '--ask-for-approval',
        'untrusted',
      ]
    : ['--safe-mode', '--permission-mode', 'manual'];
}

function prepareCheckoutNodePty(runtimeDir) {
  const source = path.dirname(require.resolve('node-pty/package.json'));
  const target = path.join(runtimeDir, 'qualification-node-pty');
  cpSync(source, target, { recursive: true });
  if (process.platform === 'darwin') {
    const helper = path.join(
      target,
      'prebuilds',
      `${process.platform}-${process.arch}`,
      'spawn-helper',
    );
    chmodSync(helper, (statSync(helper).mode & 0o777) | 0o111);
  }
  return path.join(target, 'lib', 'index.js');
}

async function control(host, ref, operation, payload, automatic = true) {
  const plan = await host.invoke({
    operation: 'plan-control',
    controlOperation: operation,
    session: ref,
    payload,
  });
  return host.invoke({
    operation,
    actorId: 'qualification-controller',
    client: 'gui',
    plan,
    expectedPlanRoot: plan.root,
    payload,
    automatic,
  });
}

async function waitForReady(host, ref, provider, label) {
  let temporaryTrustAccepted = false;
  let observedTrustTokens = [];
  let observedReadyTokens = [];
  let adapterReason = null;
  let status;
  try {
    status = await eventually(async () => {
      const current = await host.invoke({ operation: 'status', session: ref });
      if (current.interactionState === 'ready') return current;
      adapterReason = current.providerAdapter.reason;
      if (provider !== 'claude' || current.interactionState !== 'unknown') {
        return null;
      }
      const snapshot = await host.invoke({
        operation: 'snapshot',
        session: ref,
        requestedSequence: current.output.earliestSequence,
      });
      const volatileScreen = [
        snapshot.terminal.vt.lines.join('\n'),
        ...snapshot.terminal.frames.map((frame) => frame.data),
      ].join('\n');
      const trustTokens = [
        'Accessing',
        'workspace',
        'Quick',
        'safety',
        'trust',
        'folder',
        'No',
        'exit',
      ];
      observedTrustTokens = trustTokens.filter((token) =>
        volatileScreen.includes(token),
      );
      observedReadyTokens = [
        'Try',
        'edit',
        '<filepath>',
        'manual',
        'mode',
      ].filter((token) => volatileScreen.includes(token));
      if (
        temporaryTrustAccepted ||
        observedTrustTokens.length !== trustTokens.length
      ) {
        return null;
      }
      const accepted = await control(
        host,
        ref,
        'send-key',
        { key: 'Enter' },
        false,
      );
      if (accepted.status !== 'written') {
        throw new Error('temporary Claude workspace trust key was not written');
      }
      temporaryTrustAccepted = true;
      return null;
    }, label);
  } catch (error) {
    throw new Error(
      `${error.message}; adapterReason=${adapterReason ?? 'none'}; trustTokens=${observedTrustTokens.join(',') || 'none'}; readyTokens=${observedReadyTokens.join(',') || 'none'}`,
    );
  }
  return { status, temporaryTrustAccepted };
}

async function stopWorker(metadata) {
  try {
    const record = JSON.parse(await readFile(metadata, 'utf8'));
    if (Number.isInteger(record.pid)) process.kill(record.pid, 'SIGTERM');
  } catch (error) {
    if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error;
  }
}

if (!process.argv.includes('--execute')) {
  throw new Error(
    'real provider dogfood is opt-in; pass --execute with temporary --runtime-dir and --workspace paths',
  );
}

const provider = argument('--provider');
if (!['codex', 'claude'].includes(provider)) {
  throw new Error('--provider must be codex or claude');
}
const runtimeDir = requiredArgument('--runtime-dir');
const workspace = requiredArgument('--workspace');
const providerExecutable = requiredArgument('--provider-executable');
const workerExecutable = path.resolve(
  argument('--worker-executable') ?? process.execPath,
);
const workerPath = argument('--worker-path');
const ptyModule = process.argv.includes('--prepare-checkout-node-pty')
  ? prepareCheckoutNodePty(runtimeDir)
  : argument('--pty-module');
const workerEnv = { ...process.env };
if (ptyModule)
  workerEnv.KUNGFU_AGENT_SESSION_NODE_PTY_MODULE = path.resolve(ptyModule);

const hostOptions = {
  runtimeDir,
  executable: workerExecutable,
  env: workerEnv,
};
if (workerPath) hostOptions.workerPath = path.resolve(workerPath);
const host = createDetachedAgentSessionHost(hostOptions);
const ref = {
  workConsoleId: `work:provider-dogfood:${provider}`,
  sessionAttemptId: `attempt:provider-dogfood:${provider}:${Date.now()}`,
};
const token = `KUNGFU_AGENT_SESSION_${provider.toUpperCase()}_READY`;
const startedAt = Date.now();

try {
  const env = environment();
  const plan = await host.invoke({
    operation: 'plan-start',
    input: {
      ...ref,
      provider,
      providerVersion: provider === 'codex' ? '0.144.3' : '2.1.209',
      profileRoot: PROFILE_ROOT,
      executable: providerExecutable,
      argv: providerArguments(provider),
      cwd: workspace,
      env,
    },
  });
  const start = await host.invoke({
    operation: 'start',
    actorId: 'qualification-controller',
    client: 'gui',
    plan,
    expectedPlanRoot: plan.root,
    attachment: {
      attachmentId: `view:provider-dogfood:${provider}`,
      presentation: 'packaged-headless',
    },
    execution: { env, cols: 120, rows: 40 },
  });
  const initialReady = await waitForReady(
    host,
    ref,
    provider,
    `${provider} ready state`,
  );
  const initial = initialReady.status;

  const restartedMain = createDetachedAgentSessionHost(hostOptions);
  const reattached = await restartedMain.invoke({
    operation: 'status',
    session: ref,
  });
  if (reattached.capsuleId !== initial.capsuleId) {
    throw new Error('main-process reconnect changed the Capsule identity');
  }

  const sequenceBeforeInstruction = initial.output.nextSequence;
  const instruct = await control(restartedMain, ref, 'instruct', {
    text: `Reply with exactly ${token}. Do not use tools.`,
  });
  if (instruct.status !== 'written') {
    throw new Error(`${provider} instruction was not written`);
  }
  const responseStatus = await eventually(async () => {
    const status = await restartedMain.invoke({
      operation: 'status',
      session: ref,
    });
    return status.output.nextSequence > sequenceBeforeInstruction + 32
      ? status
      : null;
  }, `${provider} output after instruction`);

  const instructedEnd = await control(restartedMain, ref, 'end', {});
  if (instructedEnd.status !== 'applied') {
    throw new Error(`${provider} instruction attempt did not end`);
  }
  await eventually(async () => {
    const status = await restartedMain.invoke({
      operation: 'status',
      session: ref,
    });
    return (
      status.lifecycleState === 'ended' && status.inputAdmission === 'closed'
    );
  }, `${provider} instruction attempt exit`);

  const approvalRef = {
    workConsoleId: `work:provider-dogfood:${provider}:approval`,
    sessionAttemptId: `attempt:provider-dogfood:${provider}:approval:${Date.now()}`,
  };
  const approvalPlan = await restartedMain.invoke({
    operation: 'plan-start',
    input: {
      ...approvalRef,
      provider,
      providerVersion: provider === 'codex' ? '0.144.3' : '2.1.209',
      profileRoot: PROFILE_ROOT,
      executable: providerExecutable,
      argv: providerArguments(provider),
      cwd: workspace,
      env,
    },
  });
  await restartedMain.invoke({
    operation: 'start',
    actorId: 'qualification-controller',
    client: 'gui',
    plan: approvalPlan,
    expectedPlanRoot: approvalPlan.root,
    attachment: {
      attachmentId: `view:provider-dogfood:${provider}:approval`,
      presentation: 'packaged-headless',
    },
    execution: { env, cols: 120, rows: 40 },
  });
  const approvalReady = await waitForReady(
    restartedMain,
    approvalRef,
    provider,
    `${provider} approval attempt ready`,
  );
  const approvalProbe = path.join(workspace, 'approval-probe-must-not-exist');
  const approvalInstruction = await control(
    restartedMain,
    approvalRef,
    'instruct',
    {
      text: `Use the shell tool to run touch ${JSON.stringify(approvalProbe)}. Do not avoid the tool request.`,
    },
  );
  if (approvalInstruction.status !== 'written') {
    throw new Error(`${provider} approval probe instruction was not written`);
  }
  await eventually(async () => {
    const status = await restartedMain.invoke({
      operation: 'status',
      session: approvalRef,
    });
    return status.interactionState === 'approval-needed';
  }, `${provider} approval-needed state`);
  const denied = await control(
    restartedMain,
    approvalRef,
    'send-key',
    { key: 'Escape' },
    false,
  );
  if (denied.status !== 'written') {
    throw new Error(`${provider} approval denial key was not written`);
  }

  const ended = await control(restartedMain, approvalRef, 'end', {});
  if (ended.status !== 'applied') {
    throw new Error(`${provider} end signal was not delivered`);
  }
  await eventually(async () => {
    const status = await restartedMain.invoke({
      operation: 'status',
      session: approvalRef,
    });
    return (
      status.lifecycleState === 'ended' && status.inputAdmission === 'closed'
    );
  }, `${provider} provider exit`);

  const interruptRef = {
    workConsoleId: `work:provider-dogfood:${provider}:interrupt`,
    sessionAttemptId: `attempt:provider-dogfood:${provider}:interrupt:${Date.now()}`,
  };
  const interruptPlan = await restartedMain.invoke({
    operation: 'plan-start',
    input: {
      ...interruptRef,
      provider,
      providerVersion: provider === 'codex' ? '0.144.3' : '2.1.209',
      profileRoot: PROFILE_ROOT,
      executable: providerExecutable,
      argv: providerArguments(provider),
      cwd: workspace,
      env,
    },
  });
  await restartedMain.invoke({
    operation: 'start',
    actorId: 'qualification-controller',
    client: 'gui',
    plan: interruptPlan,
    expectedPlanRoot: interruptPlan.root,
    attachment: {
      attachmentId: `view:provider-dogfood:${provider}:interrupt`,
      presentation: 'packaged-headless',
    },
    execution: { env, cols: 120, rows: 40 },
  });
  const interruptReady = await waitForReady(
    restartedMain,
    interruptRef,
    provider,
    `${provider} interrupt attempt ready`,
  );
  const interrupted = await control(
    restartedMain,
    interruptRef,
    'interrupt',
    {},
  );
  if (interrupted.status !== 'applied') {
    throw new Error(`${provider} interrupt signal was not delivered`);
  }
  const interruptEnd = await control(restartedMain, interruptRef, 'end', {});
  if (interruptEnd.status !== 'applied') {
    throw new Error(`${provider} interrupt attempt did not end`);
  }

  const report = {
    schema: 'kungfu.agent-session.provider-dogfood/v1',
    provider,
    providerVersion: initial.providerAdapter.providerVersion,
    platform: `${process.platform}-${process.arch}`,
    worker: workerPath ? 'packaged-app' : 'source-checkout',
    cases: {
      start: start.status,
      instructAndObserveOutput: 'passed',
      approvalDetectedAndDenyKeyWritten: 'passed',
      interruptDelivered: 'passed',
      mainRestartReattach: 'passed',
      providerEndClosesInput: 'passed',
    },
    durationMilliseconds: Date.now() - startedAt,
    instructionOutputBytesObserved:
      responseStatus.output.nextSequence - sequenceBeforeInstruction,
    workspaceRoot: `sha256:${createHash('sha256').update(workspace).digest('hex')}`,
    runtimeRoot: `sha256:${createHash('sha256').update(runtimeDir).digest('hex')}`,
    rawTerminalRetained: false,
    privateEnvironmentValuesRetained: false,
    temporaryWorkspaceTrustAccepted:
      initialReady.temporaryTrustAccepted ||
      approvalReady.temporaryTrustAccepted ||
      interruptReady.temporaryTrustAccepted,
    linuxQualification: 'not-run',
    windowsQualification: 'not-run',
  };
  process.stdout.write(`${JSON.stringify(report)}\n`);
} finally {
  await stopWorker(host.metadata);
}
