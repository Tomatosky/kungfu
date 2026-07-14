// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  checkRuntimeContract,
  validateRuntimeContractValue,
} from './runtime-contract.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTRACT = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, 'framework', 'runtime', 'kungfu-runtime.contract.json'),
    'utf8',
  ),
);

test('runtime contract accepts positive fixtures and rejects all safety failures', async () => {
  const result = await checkRuntimeContract(ROOT);
  assert.equal(
    result.contract,
    'framework/runtime/kungfu-runtime.contract.json',
  );
  assert.equal(result.validFixtures, 4);
  assert.equal(result.rejectedFixtures, 6);
  assert.ok(['passed', 'skipped'].includes(result.schemaValidation));
});

test('process diagnostics do not upgrade a handle without a durable cut', () => {
  const value = {
    schema: 'kungfu.runtime.handle/v1',
    runtimeId: 'runtime-test',
    requirementId: 'request-test',
    workspaceId: 'workspace-test',
    generation: '1',
    state: 'ready',
    capabilities: ['runtime.peer-registry'],
    grantedAuthorities: ['runtime.coordinate'],
    readiness: {
      schema: 'kungfu.runtime.readiness/v1',
      state: 'ready',
      durableCut: null,
      projectionCut: null,
      evidence: [],
      observedAtNs: '1',
    },
    host: {
      kind: 'process',
      hostId: 'process-test',
      diagnostics: {
        supervisorPid: 100,
        coordinatorPid: 101,
        socketPath: null,
        serviceInstalled: true,
        guiVisible: true,
      },
    },
  };
  const issues = validateRuntimeContractValue('runtimeHandle', value, CONTRACT);
  assert.ok(issues.some((item) => item.code === 'pid-is-not-readiness'));
  assert.ok(issues.some((item) => item.code === 'readiness-cut-missing'));
});

test('process is the current topology while both contract adapters remain honest', () => {
  assert.deepEqual(
    CONTRACT.hostKinds.currentTopology.map((item) => item.id),
    ['process'],
  );
  assert.equal(
    CONTRACT.hostKinds.currentTopology[0].contractAdapterImplemented,
    false,
  );
  const embedded = CONTRACT.hostKinds.reservedNonClaims.find(
    (item) => item.id === 'embedded',
  );
  assert.equal(embedded.productionEligible, false);
  assert.equal(CONTRACT.hostKinds.publicSemanticsDependOnHostKind, false);
});

test('standalone readiness and lease targets enforce their local invariants', () => {
  const readinessIssues = validateRuntimeContractValue(
    'runtimeReadiness',
    {
      state: 'ready',
      durableCut: null,
      evidence: [{ kind: 'process-pid' }],
    },
    CONTRACT,
  );
  assert.ok(
    readinessIssues.some((item) => item.code === 'readiness-cut-missing'),
  );
  assert.ok(
    readinessIssues.some((item) => item.code === 'pid-is-not-readiness'),
  );

  const leaseIssues = validateRuntimeContractValue(
    'runtimeLease',
    {
      state: 'active',
      generation: '0',
      issuedAtNs: '2',
      expiresAtNs: '1',
    },
    CONTRACT,
  );
  assert.ok(leaseIssues.some((item) => item.code === 'invalid-generation'));
  assert.ok(leaseIssues.some((item) => item.code === 'invalid-lease-window'));
});
