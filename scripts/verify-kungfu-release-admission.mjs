#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// @ts-check

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  publicationAuthorityDigest,
  verifyPublicationAdmission,
} from '@kungfu-tech/buildchain/publication-authority';
import {
  authorityDigest,
  validateWorkflowAuthority,
} from './kungfu-workflow-authority.mjs';
import {
  buildGatePlan,
  gateActionId,
  gateDefinitionDigest,
  gateDigest,
} from './shifu-gate-runtime.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POLICY = 'docs/qualification/gates/release-admission-policy.json';

function readJson(root, relative) {
  return JSON.parse(fs.readFileSync(path.resolve(root, relative), 'utf8'));
}

function requiredFile(value, label) {
  if (typeof value !== 'string' || !value)
    throw new Error(`${label} path is required`);
  return value;
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.join('\0') !== expected.join('\0'))
    throw new Error(`${label} fields must be exactly [${expected.join(', ')}]`);
}

function validatePolicy(policy) {
  exactKeys(
    policy,
    [
      'schema',
      'repository',
      'profile',
      'requiredPlatforms',
      'workflowAuthority',
      'buildchain',
      'publication',
      'freshness',
    ],
    'release admission policy',
  );
  if (policy.schema !== 'kungfu.release-admission-policy/v1')
    throw new Error('unsupported Kungfu release admission policy');
  if (
    !Array.isArray(policy.requiredPlatforms) ||
    policy.requiredPlatforms.join('\0') !== 'linux\0macos\0windows'
  )
    throw new Error(
      'Kungfu release admission requires linux, macos, and windows',
    );
  exactKeys(
    policy.workflowAuthority,
    ['manifest', 'workflow', 'job'],
    'workflowAuthority',
  );
  exactKeys(
    policy.buildchain,
    ['version', 'runtimeSha', 'contractDigest', 'registry'],
    'buildchain',
  );
  exactKeys(
    policy.publication,
    [
      'workflowPath',
      'publisherWorkflowPath',
      'environment',
      'product',
      'target',
      'channels',
    ],
    'publication',
  );
  exactKeys(
    policy.freshness,
    ['maximumLifetimeSeconds', 'nonceReplay'],
    'freshness',
  );
  if (
    policy.freshness.maximumLifetimeSeconds !== 900 ||
    policy.freshness.nonceReplay !== 'deny'
  )
    throw new Error(
      'Kungfu admission freshness must remain fail closed at 900 seconds',
    );
  if (
    !Array.isArray(policy.publication.channels) ||
    policy.publication.channels.length === 0 ||
    new Set(policy.publication.channels).size !==
      policy.publication.channels.length
  )
    throw new Error('publication.channels must be a non-empty unique array');
}

function currentBuildchain(root, policy) {
  const packageDocument = readJson(
    root,
    'node_modules/@kungfu-tech/buildchain/package.json',
  );
  if (packageDocument.version !== policy.buildchain.version)
    throw new Error(
      'installed Buildchain version differs from release admission policy',
    );
  const contract = readJson(
    root,
    'node_modules/@kungfu-tech/buildchain/dist/site/buildchain-contract.json',
  );
  if (contract.contractDigest !== policy.buildchain.contractDigest)
    throw new Error(
      'installed Buildchain contract digest differs from release admission policy',
    );
  return readJson(root, policy.buildchain.registry);
}

function validateAuthorityJob(authorityDocument, policy) {
  const workflow = authorityDocument.workflows.find(
    (item) => item.path === policy.workflowAuthority.workflow,
  );
  const job = workflow?.jobs.find(
    (item) => item.id === policy.workflowAuthority.job,
  );
  if (!job)
    throw new Error('release admission authority job is not classified');
  if (
    job.authority !== 'release-control' ||
    job.publication !== 'channel' ||
    job.receipt !== 'qualifying'
  )
    throw new Error(
      'release admission authority job classification is not qualifying channel control',
    );
}

export function validateKungfuReleaseAdmissionPolicy(root = ROOT) {
  const policy = readJson(root, POLICY);
  validatePolicy(policy);
  const authority = validateWorkflowAuthority(root);
  if (authority.issues.length)
    throw new Error(
      `workflow authority is not closed: ${authority.issues.join('; ')}`,
    );
  validateAuthorityJob(authority.document, policy);
  const buildchainRegistry = currentBuildchain(root, policy);
  const descriptor = buildchainRegistry.entries?.find(
    (item) => item.workflowPath === policy.publication.workflowPath,
  );
  if (
    !descriptor ||
    descriptor.authorityClass !== 'product-publication' ||
    descriptor.publicationCapable !== true ||
    descriptor.publisherWorkflowMode !== 'caller-bound' ||
    descriptor.environment !== policy.publication.environment
  )
    throw new Error(
      'Buildchain registry does not authorize the configured sealed publication lane',
    );
  return { policy, authority: authority.document, buildchainRegistry };
}

function validateGateAggregate(root, aggregate, policy) {
  if (aggregate?.contract !== 'buildchain.shifu-gate-aggregate/v1')
    throw new Error('Kungfu requires a Buildchain Shifu Gate aggregate');
  if (
    aggregate.profile !== policy.profile ||
    aggregate.status !== 'pass' ||
    aggregate.ok !== true ||
    aggregate.qualifying !== true
  )
    throw new Error(
      'Kungfu release Gate aggregate is not qualifying for the configured profile',
    );
  if (!Array.isArray(aggregate.issues) || aggregate.issues.length !== 0)
    throw new Error('Kungfu release Gate aggregate contains issues');

  const registry = readJson(root, 'shifu.gates.json');
  const registryDigest = gateDigest(registry);
  if (aggregate.registry?.digest !== registryDigest)
    throw new Error('Kungfu release Gate registry digest is stale');
  const plan = buildGatePlan(registry, policy.profile, {
    digest: registryDigest,
  });
  if (!plan.ok || !plan.qualifying)
    throw new Error('current Kungfu release Gate plan is not qualifying');
  const expectedGates = new Map(
    plan.groups.flatMap((group) => group.gates).map((gate) => [gate.id, gate]),
  );
  const covered = new Set();
  for (const row of aggregate.gates || []) {
    const gate = expectedGates.get(row.gateId);
    if (!gate)
      throw new Error(`Gate aggregate contains unknown Gate '${row.gateId}'`);
    if (
      row.mode !== gate.mode ||
      row.definitionDigest !==
        gateDefinitionDigest(
          registry.gates.find((item) => item.id === row.gateId),
        ) ||
      row.actionId !==
        gateActionId(registry.gates.find((item) => item.id === row.gateId))
    )
      throw new Error(`Gate aggregate definition drift for '${row.gateId}'`);
    if (
      row.attempted !== true ||
      !['pass', 'passed', 'success'].includes(row.status) ||
      (Array.isArray(row.issues) && row.issues.length)
    )
      throw new Error(`Gate aggregate row did not qualify for '${row.gateId}'`);
    covered.add(row.gateId);
  }
  const missing = [...expectedGates.keys()].filter(
    (gateId) => !covered.has(gateId),
  );
  if (missing.length)
    throw new Error(
      `Gate aggregate is missing required Gates: ${missing.join(', ')}`,
    );
  if (
    !Array.isArray(aggregate.receipts) ||
    aggregate.receipts.length === 0 ||
    aggregate.receipts.some(
      (receipt) =>
        receipt.qualifying !== true ||
        !['pass', 'passed', 'success'].includes(receipt.status) ||
        (Array.isArray(receipt.issues) && receipt.issues.length),
    )
  )
    throw new Error(
      'Gate aggregate has missing or non-qualifying platform receipts',
    );
  const receiptPlatforms = new Set(
    aggregate.receipts.map((receipt) =>
      String(
        receipt.platform?.os ||
          receipt.platform?.id ||
          receipt.platform ||
          receipt.platformId ||
          '',
      ).toLowerCase(),
    ),
  );
  for (const platform of policy.requiredPlatforms)
    if (![...receiptPlatforms].some((item) => item.includes(platform)))
      throw new Error(`Gate aggregate is missing ${platform} qualification`);
  return { registryDigest, plan };
}

export function verifyKungfuReleaseAdmission({
  root = ROOT,
  admission,
  runnerProvenance,
  controlPlaneAudit,
  publicationEvidence,
  expected,
  usedNonces = [],
  now = new Date(),
} = {}) {
  const validated = validateKungfuReleaseAdmissionPolicy(root);
  const { policy, authority, buildchainRegistry } = validated;
  const aggregate = publicationEvidence?.gateAggregate;
  validateGateAggregate(root, aggregate, policy);

  const fixedBindings = {
    repository: policy.repository,
    publisherWorkflowPath: policy.publication.publisherWorkflowPath,
    runtimeSha: policy.buildchain.runtimeSha,
    contractDigest: policy.buildchain.contractDigest.replace(/^sha256:/, ''),
    environment: policy.publication.environment,
    product: policy.publication.product,
    target: policy.publication.target,
  };
  for (const [key, value] of Object.entries(fixedBindings))
    if (expected?.[key] !== value)
      throw new Error(
        `Kungfu release admission expected ${key} policy mismatch`,
      );
  if (!policy.publication.channels.includes(expected?.channel))
    throw new Error('Kungfu release admission channel is not allowed');
  if (admission?.workflowPath !== policy.publication.workflowPath)
    throw new Error(
      'Kungfu release admission workflow is not the sealed Buildchain authority',
    );
  if (expected?.policyDigest !== aggregate.matrixDigest)
    throw new Error(
      'Kungfu release admission policy digest differs from the Gate matrix',
    );

  const capability = verifyPublicationAdmission({
    admission,
    registry: buildchainRegistry,
    runnerProvenance,
    controlPlaneAudit,
    publicationEvidence,
    expected,
    usedNonces,
    now,
  });
  const consumerPolicy = {
    policy,
    workflowAuthorityDigest: authorityDigest(authority),
    gateRegistryDigest: aggregate.registry.digest,
    gateMatrixDigest: aggregate.matrixDigest,
  };
  return {
    schema: 'kungfu.release-admission-capability/v1',
    qualifying: true,
    consumerPolicyDigest: publicationAuthorityDigest(consumerPolicy),
    capability,
  };
}

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : '';
}

function main() {
  const result = verifyKungfuReleaseAdmission({
    admission: readJson(ROOT, requiredFile(arg('admission'), 'admission')),
    runnerProvenance: readJson(
      ROOT,
      requiredFile(arg('runner-provenance'), 'runner provenance'),
    ),
    controlPlaneAudit: readJson(
      ROOT,
      requiredFile(arg('control-plane-audit'), 'control-plane audit'),
    ),
    publicationEvidence: readJson(
      ROOT,
      requiredFile(arg('publication-evidence'), 'publication evidence'),
    ),
    expected: readJson(ROOT, requiredFile(arg('expected'), 'expected')),
    usedNonces: arg('used-nonces') ? readJson(ROOT, arg('used-nonces')) : [],
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
