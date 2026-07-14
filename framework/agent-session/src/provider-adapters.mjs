import { spawnSync } from 'node:child_process';

const PROVIDER_PROFILES = {
  codex: {
    adapterVersion: 'codex-tui/v1',
    supportedVersion: /^0\.144\.[0-9]+$/u,
    testedVersions: ['0.144.3'],
    signatures: {
      approval: [
        [
          'codex.approval.run-command',
          /would you like to run (?:this|the) command/iu,
        ],
        ['codex.approval.confirm', /press enter to confirm or esc to cancel/iu],
      ],
      busy: [['codex.busy.interrupt-hint', /esc to interrupt/iu]],
      ready: [['codex.ready.prompt', /^\s*›(?:\s|$)/mu]],
    },
  },
  claude: {
    adapterVersion: 'claude-code-tui/v1',
    supportedVersion: /^2\.1\.[0-9]+$/u,
    testedVersions: ['2.1.209'],
    signatures: {
      approval: [
        ['claude.approval.proceed', /do you want to proceed\?/iu],
        ['claude.approval.permission', /allow (?:this|the) action/iu],
      ],
      busy: [['claude.busy.interrupt-hint', /esc to interrupt/iu]],
      ready: [['claude.ready.prompt', /^\s*❯(?:\s|$)/mu]],
    },
  },
};

const GENERIC_MODAL =
  /(?:\[(?:y|yes)\/(?:n|no)\]|\((?:y|yes)\/(?:n|no)\)|permission required|press enter|approve|allow)/iu;
const VERSION = /([0-9]+\.[0-9]+\.[0-9]+)/u;
const NUL = String.fromCharCode(0);
const ESCAPE = String.fromCharCode(27);
const KEY_SEQUENCES = {
  Enter: '\r',
  Escape: '\u001b',
  Tab: '\t',
  ArrowUp: '\u001b[A',
  ArrowDown: '\u001b[B',
  ArrowRight: '\u001b[C',
  ArrowLeft: '\u001b[D',
  Backspace: '\u007f',
  y: 'y',
  n: 'n',
};

function requireProvider(provider) {
  const profile = PROVIDER_PROFILES[provider];
  if (!profile) {
    throw new Error(
      `provider adapter is unavailable for '${String(provider)}'`,
    );
  }
  return profile;
}

function cleanScreen(lines) {
  if (
    !Array.isArray(lines) ||
    !lines.every((line) => typeof line === 'string')
  ) {
    throw new Error('provider inspection requires redacted VT text-grid lines');
  }
  return lines
    .filter((line) => line.trim().length > 0)
    .slice(-12)
    .join('\n');
}

function matches(signatures, screen) {
  return signatures.find(([, pattern]) => pattern.test(screen))?.[0] ?? null;
}

function interactionResult({
  state,
  signatureId = null,
  reason = null,
  compatible,
}) {
  return {
    schema: 'kungfu.agent-session.provider-interaction/v1',
    state,
    compatible,
    signatureIds: signatureId ? [signatureId] : [],
    reason,
    rawHumanFallback: true,
  };
}

export function parseProviderVersion(provider, output) {
  requireProvider(provider);
  const version = String(output ?? '').match(VERSION)?.[1] ?? null;
  if (!version) {
    throw new Error(`${provider} --version did not return a semantic version`);
  }
  return version;
}

export function probeProviderVersion({
  provider,
  executable,
  env,
  run = spawnSync,
}) {
  requireProvider(provider);
  if (typeof executable !== 'string' || executable.length === 0) {
    throw new Error('provider version probe requires an executable');
  }
  const result = run(executable, ['--version'], {
    encoding: 'utf8',
    env: env ?? {
      PATH: process.env.PATH,
      LANG: 'C',
      LC_ALL: 'C',
    },
    shell: false,
    timeout: 10_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${provider} version probe exited with ${String(result.status)}`,
    );
  }
  const version = parseProviderVersion(
    provider,
    result.stdout || result.stderr,
  );
  const adapter = createProviderAdapter({ provider, version });
  return {
    schema: 'kungfu.agent-session.provider-version-probe/v1',
    provider,
    version,
    adapterVersion: adapter.adapterVersion,
    compatible: adapter.compatible,
    tested: adapter.tested,
    inspectedPrivateState: false,
  };
}

export function createProviderAdapter({ provider, version }) {
  const profile = requireProvider(provider);
  if (typeof version !== 'string' || version.length === 0) {
    throw new Error('provider adapter requires an explicit version');
  }
  const compatible = profile.supportedVersion.test(version);
  const tested = profile.testedVersions.includes(version);
  return Object.freeze({
    schema: 'kungfu.agent-session.provider-adapter/v1',
    provider,
    providerVersion: version,
    adapterVersion: profile.adapterVersion,
    compatible,
    tested,
    knownLimits: [
      'tui-signatures-are-versioned-and-may-drift',
      'delivery-receipt-does-not-prove-provider-understanding',
      'approval-and-deny-require-stage-6-real-provider-dogfood',
      'interrupt-proves-signal-delivery-not-provider-outcome',
    ],
    inspect({ lines, lifecycleState, inputAdmission, foreground }) {
      if (lifecycleState === 'ended' || inputAdmission === 'closed') {
        return interactionResult({ state: 'ended', compatible });
      }
      if (foreground?.provider !== provider) {
        return interactionResult({
          state: 'unknown',
          reason: 'foreground-provider-mismatch',
          compatible: false,
        });
      }
      if (!compatible) {
        return interactionResult({
          state: 'unknown',
          reason: 'adapter-version-drift',
          compatible: false,
        });
      }
      const screen = cleanScreen(lines);
      const approval = matches(profile.signatures.approval, screen);
      if (approval) {
        return interactionResult({
          state: 'approval-needed',
          signatureId: approval,
          compatible: true,
        });
      }
      const busy = matches(profile.signatures.busy, screen);
      if (busy) {
        return interactionResult({
          state: 'busy',
          signatureId: busy,
          compatible: true,
        });
      }
      const ready = matches(profile.signatures.ready, screen);
      if (ready) {
        return interactionResult({
          state: 'ready',
          signatureId: ready,
          compatible: true,
        });
      }
      return interactionResult({
        state: 'unknown',
        reason: GENERIC_MODAL.test(screen)
          ? 'unrecognized-modal-state'
          : 'no-supported-state-signature',
        compatible: true,
      });
    },
    encodeInstruction(text) {
      if (typeof text !== 'string' || text.length === 0) {
        throw new Error('instruction text must be non-empty');
      }
      if (text.includes(NUL) || text.includes(ESCAPE)) {
        throw new Error('instruction text cannot contain NUL or escape bytes');
      }
      if (/(?:\r|\n)$/u.test(text)) {
        throw new Error('instruction text cannot end with Enter');
      }
      if (Buffer.byteLength(text, 'utf8') > 64 * 1024) {
        throw new Error('instruction exceeds the 64 KiB atomic paste limit');
      }
      return `\u001b[200~${text}\u001b[201~\r`;
    },
    encodeKey(key) {
      const sequence = KEY_SEQUENCES[key];
      if (sequence === undefined) {
        throw new Error(`unsupported semantic key '${String(key)}'`);
      }
      return sequence;
    },
  });
}

export function providerAdapterMatrix() {
  return Object.entries(PROVIDER_PROFILES).map(([provider, profile]) => ({
    provider,
    adapterVersion: profile.adapterVersion,
    testedVersions: [...profile.testedVersions],
    versionPolicy: 'exact-minor-family; unrecognized versions fail visible',
    privateTranscriptRequired: false,
  }));
}
