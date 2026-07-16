// SPDX-License-Identifier: Apache-2.0

const [runtimeDir, operation, requestJson] = process.argv.slice(2);
if (!runtimeDir || !operation || !requestJson) {
  console.error('usage: node-call.cjs RUNTIME_DIR OPERATION REQUEST_JSON');
  process.exit(2);
}
const storage = require('@kungfu-tech/storage');
const capabilities = storage.capabilities();
if (!capabilities || typeof capabilities !== 'object')
  throw new Error('incomplete native capability set');
const result = storage.execute(runtimeDir, operation, JSON.parse(requestJson));
process.stdout.write(`${JSON.stringify(result)}\n`);
const holdMs = Number(process.env.KUNGFU_QUALIFICATION_HOLD_MS || 0);
if (holdMs > 0)
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, holdMs);
