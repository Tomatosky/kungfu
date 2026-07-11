#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// @ts-check

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const POLICY = path.join(HERE, 'policy.json');

function fail(message) {
  throw new Error(message);
}

function readJson(file, label) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(
      `cannot read ${label} ${file}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function parseArgs(argv) {
  const options = {
    formatReports: [],
    sdkReports: [],
    surfaceReports: [],
    publicationReport: '',
    report: '',
  };
  const repeated = {
    '--format-report': 'formatReports',
    '--sdk-report': 'sdkReports',
    '--surface-report': 'surfaceReports',
  };
  const singular = {
    '--publication-report': 'publicationReport',
    '--report': 'report',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    if (arg === '--help' || arg === '-h') {
      console.log(
        'Usage: ./shifu layers:qualify:release -- --format-report PATH --sdk-report PATH... --surface-report PATH... --publication-report PATH [--report PATH]',
      );
      process.exit(0);
    }
    const key = repeated[arg] || singular[arg];
    if (!key) fail(`unknown argument '${arg}'`);
    index += 1;
    if (index >= argv.length) fail(`${arg} requires a path`);
    const value = path.resolve(argv[index]);
    if (Array.isArray(options[key])) options[key].push(value);
    else options[key] = value;
  }
  if (!options.publicationReport)
    fail('--publication-report is required for a release verdict');
  return options;
}

function platformKey(report) {
  if (report.platform === 'portable') return 'portable';
  return `${report.platform}-${report.architecture}`;
}

function requireBoundSource(report, source, label) {
  const reportSource = report.source || {};
  if (reportSource.commit !== source.commit)
    fail(`${label} source commit does not match publication source`);
  if (reportSource.tree_dirty !== false)
    fail(`${label} must come from a clean source tree`);
}

function requireBudgets(measurements, dimensions, label) {
  for (const dimension of dimensions) {
    const raw = measurements?.[dimension];
    const value =
      raw && typeof raw === 'object' && 'value' in raw ? raw.value : raw;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
      fail(`${label} lacks exact numeric ${dimension}`);
  }
}

function requireUniquePlatformReports(reports, schema, label) {
  const result = new Map();
  for (const report of reports) {
    if (report.schema !== schema) fail(`${label} has unexpected schema`);
    if (report.status !== 'passing') fail(`${label} is not passing`);
    const platform = platformKey(report);
    if (result.has(platform)) fail(`${label} duplicates platform ${platform}`);
    result.set(platform, report);
  }
  return result;
}

function qualificationFor(report, artifactId, reportKind) {
  if (reportKind === 'sdk')
    return report.qualifications?.find((row) => row.id === artifactId);
  if (reportKind === 'surface') return report.qualifications?.[artifactId];
  return report.qualification?.id === artifactId
    ? report.qualification
    : undefined;
}

function requirePublicationCoordinate(row, id) {
  if (!row.coordinate || !row.version || !row.digest || !row.url)
    fail(`${id} publication evidence is incomplete`);
  if (!/^[a-f0-9]{64}$/.test(row.digest))
    fail(`${id} publication digest must be sha256`);
  let url;
  try {
    url = new URL(row.url);
  } catch {
    fail(`${id} publication URL is invalid`);
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname === 'localhost' ||
    url.hostname.endsWith('.invalid')
  )
    fail(`${id} publication URL must be an external HTTPS coordinate`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const policy = readJson(POLICY, 'release policy');
  if (policy.schema !== 'kungfu.layer-qualification.release-policy/v1')
    fail('unexpected release policy schema');
  const publication = readJson(options.publicationReport, 'publication report');
  if (publication.schema !== 'kungfu.layer-qualification.publication-report/v1')
    fail('unexpected publication report schema');
  if (publication.status !== 'passing')
    fail('publication report is not passing');
  if (!publication.source?.commit || !publication.release?.version)
    fail('publication report lacks source commit or release version');

  const reportSets = {
    format: requireUniquePlatformReports(
      options.formatReports.map((file) => readJson(file, 'format report')),
      'kungfu.layer-qualification.format-report/v1',
      'format report',
    ),
    sdk: requireUniquePlatformReports(
      options.sdkReports.map((file) => readJson(file, 'SDK report')),
      'kungfu.layer-qualification.sdk-report/v1',
      'SDK report',
    ),
    surface: requireUniquePlatformReports(
      options.surfaceReports.map((file) => readJson(file, 'surface report')),
      'kungfu.surface-qualification.report/v1',
      'surface report',
    ),
  };

  const artifacts = [];
  for (const [id, requirement] of Object.entries(policy.artifacts)) {
    const publicationRow = publication.artifacts?.[id];
    if (!publicationRow || publicationRow.status !== 'passing')
      fail(`${id} lacks passing publication evidence`);
    if (publicationRow.registry !== requirement.publication)
      fail(`${id} publication registry does not match policy`);
    requirePublicationCoordinate(publicationRow, id);
    if (publicationRow.version !== publication.release.version)
      fail(`${id} publication version does not match release version`);

    const platforms = [];
    for (const platform of requirement.platforms) {
      const sourceReport = reportSets[requirement.report].get(platform);
      if (!sourceReport)
        fail(`${id} lacks ${platform} ${requirement.report} report`);
      requireBoundSource(sourceReport, publication.source, `${id}/${platform}`);
      const qualification = qualificationFor(
        sourceReport,
        id,
        requirement.report,
      );
      if (!qualification || qualification.status !== 'passing')
        fail(`${id}/${platform} qualification is not passing`);
      requireBudgets(
        qualification.measurements,
        policy.budget_dimensions,
        `${id}/${platform}`,
      );
      if (
        requirement.report === 'surface' &&
        qualification.installer_uninstall?.status !== 'passing'
      )
        fail(`${id}/${platform} lacks installer-uninstall evidence`);
      platforms.push({
        platform,
        artifact_sha256: qualification.exact_artifact_sha256,
        measurements: qualification.measurements,
      });
    }
    artifacts.push({
      id,
      effective_status: 'passing',
      platforms,
      publication: publicationRow,
    });
  }

  const report = {
    schema: 'kungfu.layer-qualification.release-report/v1',
    status: 'passing',
    source: publication.source,
    release: publication.release,
    policy: path.relative(process.cwd(), POLICY),
    artifacts,
    artifact_status_counts: { passing: artifacts.length },
    boundary:
      'passing is computed from clean-source exact artifacts, every required platform, all six numeric budgets, installer-uninstall evidence for product surfaces, and immutable publication coordinates.',
  };
  if (options.report) {
    fs.mkdirSync(path.dirname(options.report), { recursive: true });
    fs.writeFileSync(options.report, `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(
    `[layers:qualify:release] passing; artifacts=${artifacts.length}; source=${report.source.commit}; version=${report.release.version}`,
  );
}

try {
  main();
} catch (error) {
  console.error(
    `[layers:qualify:release] failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
