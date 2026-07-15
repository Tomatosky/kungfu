// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  BUILDCHAIN_CONTROLLER_EVIDENCE_CONTRACT,
  controllerEvidenceDigest,
} from '@kungfu-tech/buildchain/controller-evidence';
import {
  createPublicationAdmission,
  createPublicationArtifactManifestSet,
  createPublicationControlPlaneAudit,
  createRunnerProvenance,
  publicationAuthorityDigest,
} from '@kungfu-tech/buildchain/publication-authority';
import { sha256Json } from '@kungfu-tech/buildchain/release-candidate';
import {
  buildGatePlan,
  gateActionId,
  gateDefinitionDigest,
  gateDigest,
} from './shifu-gate-runtime.mjs';
import { verifyKungfuReleaseAdmission } from './verify-kungfu-release-admission.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_SHA = '1'.repeat(40);
const RUNTIME_SHA = '52dba6d30051b53d6f6b723fa6e27b090ce4311f';
const SOURCE_TREE_SHA = 'a'.repeat(40);
const CONTRACT_DIGEST =
  '247a0f3dcfa7e066a3222f5fab5a46fa50a4870c97b1bc40001479044aed8619';

function manifestSummaryDigest(files) {
  const hash = crypto.createHash('sha256');
  for (const file of files)
    hash.update(`${file.path}\0${file.size}\0${file.sha256}\n`);
  return hash.digest('hex');
}

function fixture() {
  const registry = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'shifu.gates.json'), 'utf8'),
  );
  const registryDigest = gateDigest(registry);
  const plan = buildGatePlan(registry, 'release-promotion', {
    digest: registryDigest,
  });
  const matrixDigest = publicationAuthorityDigest({
    profile: 'release-promotion',
    registryDigest,
    requiredPlatforms: ['linux', 'macos', 'windows'],
  });
  const gates = plan.groups.flatMap((group) =>
    group.gates.map((gate) => {
      const definition = registry.gates.find((item) => item.id === gate.id);
      return {
        platformId: 'fixture',
        gateId: gate.id,
        mode: gate.mode,
        status: 'passed',
        attempted: true,
        definitionDigest: gateDefinitionDigest(definition),
        actionId: gateActionId(definition),
        issues: [],
      };
    }),
  );
  const aggregatePayload = {
    contract: 'buildchain.shifu-gate-aggregate/v1',
    profile: 'release-promotion',
    sourceSha: SOURCE_SHA,
    registry: {
      ref: 'shifu.gates.json',
      digest: registryDigest,
      projectId: 'kungfu',
    },
    matrixDigest,
    status: 'pass',
    ok: true,
    qualifying: true,
    receipts: ['linux', 'macos', 'windows'].map((platform) => ({
      platformId: `${platform}-fixture`,
      platform: { os: platform },
      status: 'passed',
      qualifying: true,
      issues: [],
    })),
    gates,
    omitted: [],
    issues: [],
  };
  const gateAggregate = {
    ...aggregatePayload,
    digest: `sha256:${publicationAuthorityDigest(aggregatePayload)}`,
  };
  const runnerProvenance = createRunnerProvenance({
    runnerClass: 'ephemeral',
    os: 'linux',
    architecture: 'x64',
    imageDigest: '7'.repeat(64),
    measurementDigest: '8'.repeat(64),
    isolation: 'fresh-vm-per-job',
  });
  const controlPlaneAudit = createPublicationControlPlaneAudit({
    repository: 'kungfu-systems/kungfu',
    workflowPath: '.github/workflows/release-candidate-promote.yml',
    publisherWorkflowPath: '.github/workflows/release-new-version.yml',
    environment: 'none',
    facts: [
      'actions-policy',
      'branch-policy',
      'environment-policy',
      'oidc-policy',
      'publisher-policy',
      'runner-policy',
    ].map((id, index) => ({
      id,
      status: 'pass',
      digest: String(index + 1).repeat(64),
    })),
    observedAt: '2026-07-15T00:00:00.000Z',
    expiresAt: '2026-07-15T00:12:00.000Z',
  });
  const controllerPayload = {
    schemaVersion: 1,
    contract: BUILDCHAIN_CONTROLLER_EVIDENCE_CONTRACT,
    kind: 'receipt',
    controller: { id: 'build-lifecycle' },
    source: { repository: 'kungfu-systems/kungfu', sha: SOURCE_SHA },
    runtime: {
      ref: RUNTIME_SHA,
      sha: RUNTIME_SHA,
      contractDigest: `sha256:${CONTRACT_DIGEST}`,
    },
    planDigest: `sha256:${'b'.repeat(64)}`,
    status: 'passed',
    qualifying: true,
    stages: [],
    evidence: [],
    issues: [],
  };
  const controllerReceipt = {
    ...controllerPayload,
    digest: controllerEvidenceDigest(controllerPayload),
  };
  const buildSummary = {};
  const files = [
    {
      path: '.buildchain/artifacts/linux-x64/diagnostics.json',
      size: 4,
      sha256: 'b'.repeat(64),
    },
    { path: 'product/release/kungfu.tgz', size: 3, sha256: '6'.repeat(64) },
  ];
  const artifactManifests = [
    {
      schemaVersion: 1,
      contract: 'kungfu-buildchain-artifact',
      artifactName: 'kungfu-linux-x64',
      platform: { id: 'linux-x64' },
      git: { repository: 'kungfu-systems/kungfu', sha: SOURCE_SHA },
      summary: {
        contract: 'kungfu-buildchain-artifact-summary',
        artifactName: 'kungfu-linux-x64',
        platform: { id: 'linux-x64' },
        fileCount: files.length,
        totalBytes: 7,
        digest: manifestSummaryDigest(files),
      },
      expectedArtifacts: { ok: true },
      files,
    },
  ];
  const artifactPayloads = [
    {
      artifactName: 'kungfu-linux-x64',
      files: [{ ...files[1] }],
    },
  ];
  const manifestSet = createPublicationArtifactManifestSet({
    repository: 'kungfu-systems/kungfu',
    sourceSha: SOURCE_SHA,
    sourceTreeSha: SOURCE_TREE_SHA,
    manifests: artifactManifests,
    payloads: artifactPayloads,
  });
  const releaseCandidatePassport = {
    schemaVersion: 1,
    contract: 'kungfu-buildchain-release-candidate-passport',
    repository: 'kungfu-systems/kungfu',
    target: { channel: 'alpha' },
    source: {
      headSha: SOURCE_SHA,
      mergeRefSha: SOURCE_SHA,
      treeHash: SOURCE_TREE_SHA,
    },
    buildchain: { sha: RUNTIME_SHA },
    platformMatrix: [
      { platformId: 'linux-x64', artifactName: 'kungfu-linux-x64' },
    ],
    diagnostics: { buildSummaryHash: sha256Json(buildSummary) },
    gateProfileEvidence: {
      contract: gateAggregate.contract,
      digest: gateAggregate.digest,
      profile: gateAggregate.profile,
      sourceSha: gateAggregate.sourceSha,
      registry: {
        projectId: gateAggregate.registry.projectId,
        digest: gateAggregate.registry.digest,
      },
      matrixDigest: gateAggregate.matrixDigest,
      status: gateAggregate.status,
      qualifying: gateAggregate.qualifying,
      receiptCount: gateAggregate.receipts.length,
      gateResultCount: gateAggregate.gates.length,
    },
    controllerReceipts: [
      {
        controllerId: 'build-lifecycle',
        planDigest: controllerReceipt.planDigest,
        receiptDigest: controllerReceipt.digest,
        sourceSha: SOURCE_SHA,
        runtimeSha: RUNTIME_SHA,
        status: 'passed',
      },
    ],
  };
  releaseCandidatePassport.candidateHash = sha256Json({
    repository: releaseCandidatePassport.repository,
    target: releaseCandidatePassport.target,
    source: releaseCandidatePassport.source,
    platformMatrix: releaseCandidatePassport.platformMatrix,
    buildchain: releaseCandidatePassport.buildchain,
    gateProfileEvidence: releaseCandidatePassport.gateProfileEvidence,
    controllerReceipts: releaseCandidatePassport.controllerReceipts,
  });
  const publicationEvidence = {
    sourceTreeSha: SOURCE_TREE_SHA,
    releaseCandidatePassport,
    buildSummary,
    controllerReceipt,
    gateAggregate,
    artifactManifests,
    artifactPayloads,
  };
  const admission = createPublicationAdmission({
    registryDigest: JSON.parse(
      fs.readFileSync(
        path.join(
          ROOT,
          'node_modules/@kungfu-tech/buildchain/dist/site/publication-authority-registry.json',
        ),
        'utf8',
      ),
    ).registryDigest,
    workflowPath: '.github/workflows/release-candidate-promote.yml',
    publisherWorkflowPath: '.github/workflows/release-new-version.yml',
    repository: 'kungfu-systems/kungfu',
    sourceSha: SOURCE_SHA,
    runtimeSha: RUNTIME_SHA,
    contractDigest: CONTRACT_DIGEST,
    policyDigest: matrixDigest,
    controllerReceiptDigest: controllerReceipt.digest,
    runnerProvenanceDigest: runnerProvenance.receiptDigest,
    controlPlaneAuditDigest: controlPlaneAudit.receiptDigest,
    gateAggregateDigest: gateAggregate.digest,
    environment: 'none',
    product: 'Kungfu Episodes',
    target: 'kungfu-product',
    version: '4.0.0-alpha.1',
    channel: 'alpha',
    artifactDigest: manifestSet.manifestSetDigest,
    nonce: 'kungfu-run-1:attempt-1:publish',
    issuedAt: '2026-07-15T00:01:00.000Z',
    expiresAt: '2026-07-15T00:10:00.000Z',
  });
  const expected = Object.fromEntries(
    [
      'repository',
      'publisherWorkflowPath',
      'sourceSha',
      'runtimeSha',
      'contractDigest',
      'policyDigest',
      'controllerReceiptDigest',
      'gateAggregateDigest',
      'environment',
      'product',
      'target',
      'version',
      'channel',
      'artifactDigest',
    ].map((key) => [key, admission[key]]),
  );
  return {
    root: ROOT,
    admission,
    runnerProvenance,
    controlPlaneAudit,
    publicationEvidence,
    expected,
    now: new Date('2026-07-15T00:05:00.000Z'),
  };
}

test('Kungfu independently accepts only a current sealed qualifying capability', () => {
  const result = verifyKungfuReleaseAdmission(fixture());
  assert.equal(result.qualifying, true);
  assert.equal(result.capability.decision, 'allow');
  assert.equal(result.capability.runtimeSha, RUNTIME_SHA);
  assert.match(result.consumerPolicyDigest, /^[0-9a-f]{64}$/);
});

test('Kungfu rejects missing platform evidence and replayed or stale admission', () => {
  const missingPlatform = fixture();
  missingPlatform.publicationEvidence.gateAggregate.receipts.pop();
  assert.throws(
    () => verifyKungfuReleaseAdmission(missingPlatform),
    /missing windows qualification/,
  );

  const replayed = fixture();
  replayed.usedNonces = [replayed.admission.nonce];
  assert.throws(
    () => verifyKungfuReleaseAdmission(replayed),
    /nonce was replayed/,
  );

  const stale = fixture();
  stale.now = new Date('2026-07-15T00:11:00.000Z');
  assert.throws(() => verifyKungfuReleaseAdmission(stale), /stale/);
});

test('Kungfu rejects policy, runner, control-plane, and artifact substitution', () => {
  const policy = fixture();
  policy.expected.channel = 'latest';
  assert.throws(
    () => verifyKungfuReleaseAdmission(policy),
    /channel is not allowed/,
  );

  const runner = fixture();
  runner.runnerProvenance.qualificationStatus = 'unqualified';
  assert.throws(
    () => verifyKungfuReleaseAdmission(runner),
    /runner provenance qualification floor was not met|digest mismatch/,
  );

  const controlPlane = fixture();
  controlPlane.controlPlaneAudit.facts[0].status = 'fail';
  assert.throws(
    () => verifyKungfuReleaseAdmission(controlPlane),
    /control-plane audit fact did not pass|digest mismatch/,
  );

  const artifact = fixture();
  artifact.publicationEvidence.artifactPayloads[0].files[0].sha256 = 'e'.repeat(
    64,
  );
  assert.throws(
    () => verifyKungfuReleaseAdmission(artifact),
    /payload bytes do not match/,
  );
});
