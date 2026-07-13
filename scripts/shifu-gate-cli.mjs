// SPDX-License-Identifier: Apache-2.0
// @ts-check

import fs from 'node:fs';
import path from 'node:path';

import { buildGatePlan, loadGateRegistry } from './shifu-gate-runtime.mjs';

const CONTRACT = path.join('docs', 'shifu', 'gate-contract.json');
/** @type {Record<string, string>} */
const SCHEMAS = {
  registry: path.join(
    'docs',
    'shifu',
    'schema',
    'gate-registry-v1.schema.json',
  ),
  plan: path.join('docs', 'shifu', 'schema', 'gate-plan-v1.schema.json'),
};

/** @typedef {{write:(chunk:any)=>any}} Writer */
/** @typedef {{code:string, path:string, message:string}} GateIssue */

export function gateHelp() {
  return `shifu gate — inspect and plan project gates through one versioned control plane
  gate contract                         print the canonical Gate contract
  gate schema <registry|plan>           print a canonical JSON Schema
  gate validate [--registry FILE|-] [--json]
                                        validate syntax, ids, dependencies, cycles and profiles
  gate list [--registry FILE] [--json]  list registered gates
  gate show GATE [--registry FILE] [--json]
                                        show one gate declaration
  gate explain GATE [--profile PROFILE] [--registry FILE] [--json]
                                        explain purpose, dependencies, documentation and policy
  gate matrix [--registry FILE] [--json]
                                        show every gate against every explicit profile decision
  gate plan PROFILE [--include-advisory] [--gate GATE] [--platform PLATFORM]
                    [--registry FILE] [--json]
                                        produce a deterministic dependency and platform plan

Registry discovery: --registry, then SHIFU_GATE_REGISTRY, then shifu.gates.json.
Every profile must explicitly decide every gate as required, advisory, or off.
--gate is a diagnostic selection override: it never changes profile policy and
makes the resulting plan non-qualifying. This contract stage plans only; it does
not execute actions or issue qualification receipts.`;
}

/** @param {unknown} value @param {Writer} stdout */
function printJson(value, stdout) {
  stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

/** @param {string[]} argv */
function extractCommon(argv) {
  const rest = [];
  let registry = '';
  let json = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') json = true;
    else if (arg === '--registry') {
      registry = argv[index + 1] || '';
      if (!registry) throw new Error('--registry requires FILE or -');
      index += 1;
    } else rest.push(arg);
  }
  return { rest, registry, json };
}

/** @param {string} root @param {string} registryRef @returns {any} */
function loadValid(root, registryRef) {
  const loaded = loadGateRegistry(root, registryRef);
  if (loaded.issues.length) {
    const first = loaded.issues[0];
    throw new Error(
      `gate registry is invalid: ${first.path || '/'} ${first.message} (${loaded.issues.length} issue${loaded.issues.length === 1 ? '' : 's'})`,
    );
  }
  return loaded;
}

/** @param {any} loaded */
function registryIdentity(loaded) {
  return {
    ref: loaded.ref,
    digest: loaded.digest,
    projectId: loaded.registry.project.id,
  };
}

/** @param {any} registry @param {string} id */
function gateById(registry, id) {
  const gates = /** @type {any[]} */ (registry.gates);
  const gate = gates.find((item) => item.id === id);
  if (!gate) throw new Error(`unknown gate: ${id}`);
  return gate;
}

/** @param {any} registry @param {string} id */
function profileById(registry, id) {
  const profiles = /** @type {any[]} */ (registry.profiles);
  const profile = profiles.find((item) => item.id === id);
  if (!profile) throw new Error(`unknown gate profile: ${id}`);
  return profile;
}

/** @param {any} registry @param {any} loaded @param {any} gate @param {string} [profileId] */
function detail(registry, loaded, gate, profileId = '') {
  const decisions = Object.fromEntries(
    [...registry.profiles]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((profile) => [profile.id, profile.decisions[gate.id]]),
  );
  return {
    schema: 'shifu.gate-detail/v1',
    registry: registryIdentity(loaded),
    gate,
    profile: profileId
      ? {
          id: profileId,
          decision: profileById(registry, profileId).decisions[gate.id],
        }
      : null,
    decisions,
  };
}

/** @param {any} value @param {Writer} stdout */
function humanDetail(value, stdout) {
  const gate = value.gate;
  stdout.write(`${gate.id}: ${gate.title}\n`);
  stdout.write(`${gate.summary}\n`);
  stdout.write(`category: ${gate.category}\n`);
  stdout.write(
    `cost: ${gate.cost.class} (timeout ${gate.cost.timeoutSeconds}s)\n`,
  );
  stdout.write(`platforms: ${gate.platforms.join(', ')}\n`);
  stdout.write(`runner: ${gate.runner.capabilities.join(', ') || 'none'}\n`);
  stdout.write(`dependencies: ${gate.dependencies.join(', ') || 'none'}\n`);
  stdout.write(`action: ${gate.action.kind}\n`);
  stdout.write(`receipt: ${gate.receipt.expectation}\n`);
  stdout.write(`documentation: ${gate.documentation}\n`);
  if (value.profile)
    stdout.write(
      `profile ${value.profile.id}: ${value.profile.decision.mode} — ${value.profile.decision.reason}\n`,
    );
  else {
    stdout.write('profiles:\n');
    for (const [id, decision] of Object.entries(value.decisions))
      stdout.write(`  ${id}: ${decision.mode} — ${decision.reason}\n`);
  }
}

/** @param {any} registry @param {any} loaded */
function matrixValue(registry, loaded) {
  const profiles = [...registry.profiles].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  return {
    schema: 'shifu.gate-matrix/v1',
    registry: registryIdentity(loaded),
    profiles: profiles.map(({ id, title }) => ({ id, title })),
    rows: [...registry.gates]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((gate) => ({
        id: gate.id,
        title: gate.title,
        costClass: gate.cost.class,
        documentation: gate.documentation,
        decisions: Object.fromEntries(
          profiles.map((profile) => [profile.id, profile.decisions[gate.id]]),
        ),
      })),
  };
}

/** @param {any} value @param {Writer} stdout */
function humanMatrix(value, stdout) {
  const profiles = /** @type {any[]} */ (value.profiles);
  const matrixRows = /** @type {any[]} */ (value.rows);
  const headers = ['gate', 'cost', ...profiles.map((profile) => profile.id)];
  const rows = matrixRows.map((row) => [
    row.id,
    row.costClass,
    ...profiles.map((profile) => row.decisions[profile.id].mode),
  ]);
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => String(row[index]).length)),
  );
  /** @param {any[]} row */
  const line = (row) =>
    row.map((item, index) => String(item).padEnd(widths[index])).join('  ');
  stdout.write(`${line(headers)}\n`);
  stdout.write(`${widths.map((width) => '-'.repeat(width)).join('  ')}\n`);
  for (const row of rows) stdout.write(`${line(row)}\n`);
}

/** @param {string[]} argv */
function parsePlanArgs(argv) {
  let profile = '';
  let platform = null;
  let includeAdvisory = false;
  const explicitGates = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`${arg} requires a value`);
      return argv[index];
    };
    if (arg === '--include-advisory') includeAdvisory = true;
    else if (arg === '--gate') explicitGates.push(value());
    else if (arg === '--platform') platform = value();
    else if (arg.startsWith('-'))
      throw new Error(`unknown gate plan option: ${arg}`);
    else if (!profile) profile = arg;
    else throw new Error(`unexpected gate plan argument: ${arg}`);
  }
  if (!profile) throw new Error('gate plan requires PROFILE');
  return { profile, platform, includeAdvisory, explicitGates };
}

/** @param {any} plan @param {Writer} stdout */
function humanPlan(plan, stdout) {
  stdout.write(
    `profile: ${plan.profile}; platform: ${plan.platform || 'all'}; qualifying: ${plan.qualifying}\n`,
  );
  if (plan.unsupported.length) {
    stdout.write('unsupported:\n');
    for (const item of plan.unsupported)
      stdout.write(`  ${item.id}: ${item.reason}\n`);
  }
  for (const group of plan.groups) {
    stdout.write(`group ${group.index}:\n`);
    for (const gate of group.gates)
      stdout.write(
        `  ${gate.id} [${gate.mode}, ${gate.cost.class}] (${gate.selectedBy.join(', ')})\n`,
      );
  }
  if (plan.skipped.length) {
    stdout.write('skipped:\n');
    for (const item of plan.skipped)
      stdout.write(`  ${item.id} [${item.mode}]: ${item.reason}\n`);
  }
}

/**
 * @param {string[]} argv
 * @param {{root?:string, stdout?:Writer, stderr?:Writer}} [options]
 */
export async function runGateCommand(
  argv,
  {
    root = process.cwd(),
    stdout = process.stdout,
    stderr = process.stderr,
  } = {},
) {
  const sub = argv[0] || 'help';
  if (sub === 'contract' && argv.length === 1) {
    stdout.write(fs.readFileSync(path.join(root, CONTRACT)));
    return 0;
  }
  if (sub === 'schema' && argv.length === 2 && SCHEMAS[argv[1]]) {
    stdout.write(fs.readFileSync(path.join(root, SCHEMAS[argv[1]])));
    return 0;
  }
  if (sub === 'help' || sub === '-h' || sub === '--help') {
    stderr.write(`${gateHelp()}\n`);
    return 0;
  }
  const { rest, registry: registryRef, json } = extractCommon(argv.slice(1));
  if (sub === 'validate') {
    if (rest.length)
      throw new Error(`unexpected gate validate argument: ${rest[0]}`);
    /** @type {any} */
    let loaded;
    try {
      loaded = loadGateRegistry(root, registryRef);
    } catch (error) {
      loaded = {
        ref:
          registryRef || process.env.SHIFU_GATE_REGISTRY || 'shifu.gates.json',
        digest: null,
        registry: null,
        issues: [
          {
            code: 'registry-read',
            path: '',
            message: error instanceof Error ? error.message : String(error),
          },
        ],
      };
    }
    const value = {
      schema: 'shifu.gate-validation/v1',
      registry: { ref: loaded.ref, digest: loaded.digest },
      valid: loaded.issues.length === 0,
      issues: loaded.issues,
    };
    if (json) printJson(value, stdout);
    else if (value.valid)
      stdout.write(
        `valid gate registry: ${loaded.ref} (${loaded.registry.gates.length} gates, ${loaded.registry.profiles.length} profiles)\n`,
      );
    else {
      stderr.write(`invalid gate registry: ${loaded.ref}\n`);
      for (const item of value.issues)
        stderr.write(`  ${item.code} ${item.path || '/'}: ${item.message}\n`);
    }
    return value.valid ? 0 : 1;
  }

  const loaded = loadValid(root, registryRef);
  const registry = loaded.registry;
  if (sub === 'list') {
    if (rest.length)
      throw new Error(`unexpected gate list argument: ${rest[0]}`);
    const value = {
      schema: 'shifu.gate-list/v1',
      registry: registryIdentity(loaded),
      gates: [...registry.gates]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((gate) => ({
          id: gate.id,
          title: gate.title,
          category: gate.category,
          costClass: gate.cost.class,
          documentation: gate.documentation,
        })),
    };
    if (json) printJson(value, stdout);
    else
      for (const gate of value.gates)
        stdout.write(`${gate.id}\t${gate.costClass}\t${gate.title}\n`);
    return 0;
  }
  if (sub === 'show' || sub === 'explain') {
    const id = rest[0];
    if (!id) throw new Error(`gate ${sub} requires GATE`);
    let profileId = '';
    for (let index = 1; index < rest.length; index += 1) {
      if (rest[index] === '--profile') {
        profileId = rest[index + 1] || '';
        if (!profileId) throw new Error('--profile requires PROFILE');
        index += 1;
      } else throw new Error(`unknown gate ${sub} option: ${rest[index]}`);
    }
    const value = detail(registry, loaded, gateById(registry, id), profileId);
    if (json) printJson(value, stdout);
    else humanDetail(value, stdout);
    return 0;
  }
  if (sub === 'matrix') {
    if (rest.length)
      throw new Error(`unexpected gate matrix argument: ${rest[0]}`);
    const value = matrixValue(registry, loaded);
    if (json) printJson(value, stdout);
    else humanMatrix(value, stdout);
    return 0;
  }
  if (sub === 'plan') {
    const options = parsePlanArgs(rest);
    const plan = buildGatePlan(registry, options.profile, {
      ref: loaded.ref,
      digest: loaded.digest,
      includeAdvisory: options.includeAdvisory,
      explicitGates: options.explicitGates,
      platform: options.platform,
    });
    if (json) printJson(plan, stdout);
    else humanPlan(plan, stdout);
    return plan.ok ? 0 : 1;
  }
  stderr.write(`${gateHelp()}\n`);
  return 2;
}
