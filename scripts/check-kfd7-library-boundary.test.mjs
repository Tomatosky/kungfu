#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const readJson = (path) => JSON.parse(read(path));

const contractPath =
  'framework/core/architecture/kfd7-library-boundary.contract.json';
const contract = readJson(contractPath);
const layers = readJson('framework/core/architecture/layers.json');
const embeddingHeader = read(
  'framework/core/src/libkungfu/include/kungfu/embedding.h',
);
const storageHeader = read(
  'framework/core/src/libkungfu/include/kungfu/native_storage.h',
);
const successorHeader = read(
  'framework/core/src/libkungfu/include/kungfu/api.h',
);

assert.equal(contract.$schema, 'kungfu.kfd7-library-boundary.contract/v1');
assert.equal(contract.status, 'implementation-candidate');
assert.equal(contract.kfd7Status, 'draft');
assert.equal(contract.consumerReadiness.adopterCountGate, false);
assert.ok(
  contract.layers.some(
    (layer) =>
      layer.id === 'action-geometry' &&
      layer.forbids.includes('domain-fields-or-lifecycle-vocabulary'),
  ),
);
assert.equal(
  contract.authority.actionGeometryContract,
  'framework/action/action-geometry.contract.json',
);
assert.equal(
  contract.authority.agentWorkDomainProfile,
  'framework/agent-work/kungfu-agent-work-domain-profile.contract.json',
);

const current = new Map(
  contract.currentPublicAbi.symbols.map((entry) => [entry.name, entry]),
);
const registered = new Map(
  layers.public_contracts.stable_symbols.map((entry) => [entry.name, entry]),
);

for (const symbol of [
  'kungfu_get_api',
  'kungfu_embedding_get_api',
  'kungfu_native_storage_get_api',
]) {
  assert.ok(
    current.has(symbol),
    `contract missing current public symbol ${symbol}`,
  );
  assert.ok(
    registered.has(symbol),
    `layer registry missing current public symbol ${symbol}`,
  );
  assert.deepEqual(
    current.get(symbol).versions,
    registered.get(symbol).abi_versions,
    `${symbol} ABI versions drifted between boundary contract and layer registry`,
  );
}

for (const version of [1, 2, 3, 4, 5]) {
  assert.match(
    embeddingHeader,
    new RegExp(`KF_EMBEDDING_ABI_V${version}\\s+UINT32_C\\(${version}\\)`),
  );
}
assert.match(storageHeader, /KF_NATIVE_STORAGE_ABI_V1\s+UINT32_C\(1\)/);

assert.equal(contract.successorAbi.status, 'implemented-unqualified');
assert.equal(contract.successorAbi.bootstrap.symbol, 'kungfu_get_api');
assert.match(successorHeader, /KF_ABI_V1\s+UINT32_C\(1\)/);
assert.match(successorHeader, /kungfu_get_api\s*\(/);
assert.deepEqual(
  registered.get(contract.successorAbi.bootstrap.symbol).abi_versions,
  [1],
);

assert.deepEqual(
  contract.successorAbi.interfaces.map((entry) => entry.id),
  ['discovery', 'stream', 'ledger-action', 'maintenance'],
);
assert.deepEqual(
  contract.dependencies.map((entry) => entry.statusAtInventory),
  ['completed', 'completed', 'completed'],
);
assert.ok(
  contract.dependencies.every((entry) =>
    /^sha256:[0-9a-f]{64}$/.test(entry.admittedRoot),
  ),
  'completed dependencies must retain exact admitted roots',
);
assert.deepEqual(contract.compatibility.retainedVersions, {
  kungfu_embedding_get_api: [1, 2, 3, 4, 5],
  kungfu_native_storage_get_api: [1],
});

for (const path of Object.values(contract.authority)) {
  assert.ok(fs.existsSync(path), `missing authority file ${path}`);
}

console.log('KFD-7 library boundary contract: ok');
