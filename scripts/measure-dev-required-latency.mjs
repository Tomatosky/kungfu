#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// @ts-check

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { planAffectedPaths } from './run-core-affected-native.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_BRANCH = 'dev/v4/v4.0';
const MINIMUM_SAMPLE_COUNT = 20;
const MINIMUM_NATIVE_SAMPLE_COUNT = 10;
const BASELINE_PATH = path.join(
  ROOT,
  'framework',
  'core',
  'architecture',
  'dev-gate-latency-baseline.json',
);

function parseArgs(argv) {
  const options = {
    repository: process.env.GITHUB_REPOSITORY || '',
    branch: DEFAULT_BRANCH,
    limit: 30,
    output: '',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--repository') options.repository = argv[++index];
    else if (arg === '--branch') options.branch = argv[++index];
    else if (arg === '--limit') options.limit = Number(argv[++index]);
    else if (arg === '--output') options.output = argv[++index];
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (
    !Number.isInteger(options.limit) ||
    options.limit < 1 ||
    options.limit > 100
  ) {
    throw new Error('--limit must be an integer from 1 to 100');
  }
  return options;
}

function repositoryFromOrigin() {
  const result = spawnSync('git', ['remote', 'get-url', 'origin'], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: false,
  });
  if (result.status !== 0) return '';
  const match = result.stdout
    .trim()
    .match(/github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?$/);
  return match?.[1] || '';
}

function githubToken() {
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  const result = spawnSync('gh', ['auth', 'token'], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(
      'GitHub token unavailable; set GH_TOKEN/GITHUB_TOKEN or authenticate gh',
    );
  }
  return result.stdout.trim();
}

async function githubJson(route, token) {
  const response = await fetch(`https://api.github.com${route}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'kungfu-dev-gate-latency',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!response.ok) {
    const body = (await response.text()).slice(0, 500);
    throw new Error(`GitHub API ${response.status} for ${route}: ${body}`);
  }
  return response.json();
}

async function githubPages(route, token, limit = Number.POSITIVE_INFINITY) {
  const separator = route.includes('?') ? '&' : '?';
  const records = [];
  for (let page = 1; records.length < limit; page += 1) {
    const batch = await githubJson(
      `${route}${separator}per_page=100&page=${page}`,
      token,
    );
    if (!Array.isArray(batch)) throw new Error(`expected array from ${route}`);
    records.push(...batch);
    if (batch.length < 100) break;
  }
  return records.slice(0, limit);
}

function milliseconds(start, end) {
  return new Date(end).getTime() - new Date(start).getTime();
}

export function nearestRank(values, quantile) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(quantile * sorted.length) - 1)];
}

export function summarize(samples) {
  const durations = samples.map(({ durationMs }) => durationMs);
  return {
    sampleCount: samples.length,
    p50Ms: nearestRank(durations, 0.5),
    p95Ms: nearestRank(durations, 0.95),
    maxMs: durations.length ? Math.max(...durations) : null,
  };
}

export function validateBaseline(baseline, requiredContexts) {
  if (baseline.$schema !== 'kungfu.dev-required-latency-baseline/v1') {
    throw new Error('unsupported dev required latency baseline schema');
  }
  const expected = [...baseline.requiredContexts].sort();
  const actual = [...requiredContexts].sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw new Error(
      `live required contexts drifted: expected ${expected.join(', ')}, got ${actual.join(', ')}`,
    );
  }
  return true;
}

export function selectedContext(checkRuns, actionsRuns, context) {
  const candidates = checkRuns
    .filter((check) => check.name === context && check.status === 'completed')
    .sort(
      (left, right) =>
        new Date(left.completed_at) - new Date(right.completed_at),
    );
  if (!candidates.length) return { status: 'missing', context };
  const latest = candidates.at(-1);
  if (latest.conclusion !== 'success') {
    return { status: 'non-success', context, conclusion: latest.conclusion };
  }
  const candidateRunIds = candidates
    .map(
      ({ details_url: detailsUrl }) =>
        detailsUrl?.match(/\/actions\/runs\/(\d+)/)?.[1],
    )
    .filter(Boolean);
  const matchingRuns = actionsRuns.filter((run) =>
    candidateRunIds.includes(String(run.id)),
  );
  const created = matchingRuns
    .map(({ created_at: value }) => value)
    .filter(Boolean)
    .sort();
  const start =
    created[0] ||
    candidates
      .map(({ started_at: value }) => value)
      .filter(Boolean)
      .sort()[0];
  return {
    status: 'success',
    context,
    startedAt: start,
    completedAt: latest.completed_at,
    durationMs: milliseconds(start, latest.completed_at),
    queueMs: milliseconds(start, latest.started_at),
    retryCount: Math.max(0, candidates.indexOf(latest)),
    startAuthority: created.length
      ? 'workflow.created_at'
      : 'check.started_at-fallback',
    checkRunId: latest.id,
    workflowRunIds: [...new Set(candidateRunIds.map(Number))].sort(
      (a, b) => a - b,
    ),
  };
}

function workflowRunIds(checkRuns) {
  return [
    ...new Set(
      checkRuns
        .map(
          ({ details_url: detailsUrl }) =>
            detailsUrl?.match(/\/actions\/runs\/(\d+)/)?.[1],
        )
        .filter(Boolean),
    ),
  ];
}

async function collectSample(repository, pull, requiredContexts, token) {
  const sha = pull.head.sha;
  const [checkPayload, files] = await Promise.all([
    githubJson(
      `/repos/${repository}/commits/${sha}/check-runs?per_page=100`,
      token,
    ),
    githubPages(`/repos/${repository}/pulls/${pull.number}/files`, token),
  ]);
  const checkRuns = checkPayload.check_runs || [];
  const actionsRuns = await Promise.all(
    workflowRunIds(checkRuns).map((runId) =>
      githubJson(`/repos/${repository}/actions/runs/${runId}`, token),
    ),
  );
  const checks = requiredContexts.map((context) =>
    selectedContext(checkRuns, actionsRuns, context),
  );
  const incomplete = checks.filter(({ status }) => status !== 'success');
  const changedPaths = [
    ...new Set(
      files
        .flatMap((file) => [file.filename, file.previous_filename])
        .filter(Boolean),
    ),
  ].sort();
  let classification = {
    kind: 'unknown',
    reason: 'planner did not run',
    planDigest: null,
  };
  try {
    const plan = planAffectedPaths(changedPaths, pull.base.sha, sha);
    classification = {
      kind: plan.closureComponents.length ? 'native' : 'non-native',
      reason: plan.platformTier,
      planDigest: plan.planDigest,
    };
  } catch (error) {
    classification = {
      kind: 'unknown',
      reason: error.message,
      planDigest: null,
    };
  }
  if (incomplete.length) {
    return {
      excluded: true,
      exclusionReason: 'required-context-incomplete',
      pullRequest: pull.number,
      sourceSha: sha,
      classification,
      checks,
    };
  }
  const startedAt = checks.map(({ startedAt }) => startedAt).sort()[0];
  const completedAt = checks
    .map(({ completedAt }) => completedAt)
    .sort()
    .at(-1);
  return {
    excluded: false,
    pullRequest: pull.number,
    mergedAt: pull.merged_at,
    sourceSha: sha,
    baseSha: pull.base.sha,
    classification,
    cache: { outcome: 'unknown', authority: 'no-provider-receipt-collected' },
    startedAt,
    completedAt,
    durationMs: milliseconds(startedAt, completedAt),
    checks,
  };
}

export function report(repository, branch, requiredContexts, records) {
  const samples = records.filter(({ excluded }) => !excluded);
  const byKind = (kind) =>
    samples.filter(({ classification }) => classification.kind === kind);
  const statistics = {
    all: summarize(samples),
    native: summarize(byKind('native')),
    nonNative: summarize(byKind('non-native')),
    unknown: summarize(byKind('unknown')),
  };
  const enoughSamples =
    statistics.all.sampleCount >= MINIMUM_SAMPLE_COUNT &&
    statistics.native.sampleCount >= MINIMUM_NATIVE_SAMPLE_COUNT;
  const meetsTarget =
    statistics.all.p50Ms <= 300000 && statistics.all.p95Ms <= 600000;
  return {
    schema: 'kungfu.dev-required-latency/v1',
    generatedAt: new Date().toISOString(),
    repository,
    branch,
    metric: {
      start:
        'earliest workflow.created_at among required contexts for the final PR source revision',
      end: 'latest terminal success among all branch-protection required contexts',
      retries:
        'included from the first matching workflow run through the latest successful check',
      percentile: 'nearest-rank',
      target: { p50Ms: 300000, p95Ms: 600000 },
      minimumSamples: {
        all: MINIMUM_SAMPLE_COUNT,
        native: MINIMUM_NATIVE_SAMPLE_COUNT,
      },
    },
    branchProtection: { requiredContexts },
    statistics,
    verdict: {
      qualified: enoughSamples && meetsTarget,
      reason:
        statistics.all.sampleCount === 0
          ? 'no qualifying samples'
          : !enoughSamples
            ? 'insufficient overall or native sample count'
            : meetsTarget
              ? 'observed sample meets target'
              : 'observed sample exceeds target',
    },
    samples,
    exclusions: records.filter(({ excluded }) => excluded),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const repository = options.repository || repositoryFromOrigin();
  if (!/^[^/]+\/[^/]+$/.test(repository))
    throw new Error('cannot resolve GitHub repository');
  const token = githubToken();
  const branchPath = encodeURIComponent(options.branch);
  const [protection, pulls] = await Promise.all([
    githubJson(
      `/repos/${repository}/branches/${branchPath}/protection/required_status_checks`,
      token,
    ),
    githubPages(
      `/repos/${repository}/pulls?state=closed&base=${encodeURIComponent(options.branch)}&sort=updated&direction=desc`,
      token,
      options.limit * 3,
    ),
  ]);
  const requiredContexts = [
    ...new Set([
      ...(protection.contexts || []),
      ...(protection.checks || []).map(({ context }) => context),
    ]),
  ].sort();
  if (!requiredContexts.length)
    throw new Error(`no required contexts on ${options.branch}`);
  validateBaseline(
    JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')),
    requiredContexts,
  );
  const merged = pulls
    .filter(({ merged_at: mergedAt }) => mergedAt)
    .slice(0, options.limit);
  const records = [];
  for (const pull of merged) {
    records.push(
      await collectSample(repository, pull, requiredContexts, token),
    );
    console.error(`[dev-gate-latency] collected PR #${pull.number}`);
  }
  const value = report(repository, options.branch, requiredContexts, records);
  const json = `${JSON.stringify(value, null, 2)}\n`;
  if (options.output) {
    const output = path.resolve(ROOT, options.output);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, json);
    console.error(`[dev-gate-latency] wrote ${path.relative(ROOT, output)}`);
  } else {
    process.stdout.write(json);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(`[dev-gate-latency] ${error.message}`);
    process.exitCode = 1;
  });
}
