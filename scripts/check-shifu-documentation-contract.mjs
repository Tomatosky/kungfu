#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// @ts-check

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { validateDocumentationSubmission } from './shifu-documentation-runtime.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

async function loadAjv2020() {
  try {
    return (await import('ajv/dist/2020.js')).default;
  } catch (error) {
    if (error && error.code === 'ERR_MODULE_NOT_FOUND') return null;
    throw error;
  }
}

function pointerParent(value, pointer) {
  const parts = pointer
    .split('/')
    .slice(1)
    .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'));
  const key = parts.pop();
  let parent = value;
  for (const part of parts)
    parent = parent[Number.isInteger(Number(part)) ? Number(part) : part];
  return { parent, key };
}

function applyMutation(value, mutation) {
  const copy = structuredClone(value);
  const { parent, key } = pointerParent(copy, mutation.path);
  if (mutation.op === 'replace') {
    if (!(key in parent))
      throw new Error(`replace target is missing: ${mutation.path}`);
    parent[key] = mutation.value;
  } else if (mutation.op === 'add') {
    if (Array.isArray(parent) && key === '-') parent.push(mutation.value);
    else parent[key] = mutation.value;
  } else throw new Error(`unsupported fixture mutation: ${mutation.op}`);
  return copy;
}

export async function checkShifuDocumentationContract(root = ROOT) {
  const contractPath = path.join(
    root,
    'docs/shifu/documentation-contract.json',
  );
  const contract = readJson(contractPath);
  assert.equal(contract.schema, 'shifu.documentation-contract/v1');
  assert.equal(contract.owner, 'shifu');
  const submissionSchema = readJson(
    path.join(root, contract.authority.submissionSchema),
  );
  const receiptSchema = readJson(
    path.join(root, contract.authority.receiptSchema),
  );
  assert.equal(submissionSchema.$id, contract.schemaIds.submission);
  assert.equal(receiptSchema.$id, contract.schemaIds.receipt);
  for (const source of [
    contract.decision,
    contract.authority.runtime,
    contract.authority.defaultSubmission,
  ])
    assert.ok(
      fs.existsSync(path.join(root, source)),
      `missing contract source: ${source}`,
    );

  const dispatchMarkers = [
    ['shifu', 'build | rebuild | cache | docs | gate | proxy | config'],
    ['shifu.cmd', 'if /i "%~1"=="docs"'],
    ['crates/shifu/src/main.rs', '"cache", "docs", "gate"'],
    ['shifu.mjs', "if (cmd === 'docs')"],
  ];
  for (const [source, marker] of dispatchMarkers)
    assert.ok(
      fs.readFileSync(path.join(root, source), 'utf8').includes(marker),
      `${source} does not route the docs command`,
    );

  const submission = readJson(
    path.join(root, contract.authority.defaultSubmission),
  );
  const valid = validateDocumentationSubmission(submission, {
    root,
    checkFiles: true,
  });
  assert.deepEqual(valid.diagnostics, []);
  assert.match(valid.projection.roots.contract, /^sha256:[0-9a-f]{64}$/);
  assert.match(valid.projection.roots.content, /^sha256:[0-9a-f]{64}$/);

  const invalidRoot = path.join(
    root,
    'docs/shifu/examples/documentation/invalid',
  );
  const fixtures = fs
    .readdirSync(invalidRoot)
    .filter((name) => name.endsWith('.fixture.json'));
  assert.equal(fixtures.length, 6);
  for (const name of fixtures) {
    const fixture = readJson(path.join(invalidRoot, name));
    assert.equal(fixture.schema, 'shifu.documentation-negative-fixture/v1');
    const result = validateDocumentationSubmission(
      applyMutation(submission, fixture.mutation),
      {
        root,
        checkFiles: false,
      },
    );
    assert.ok(
      result.diagnostics.some((item) => item.code === fixture.expect),
      `${name} did not fail with ${fixture.expect}: ${JSON.stringify(result.diagnostics)}`,
    );
  }

  let schemaValidation = 'skipped';
  const Ajv2020 = await loadAjv2020();
  if (Ajv2020) {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    const validate = ajv.compile(submissionSchema);
    ajv.compile(receiptSchema);
    assert.equal(validate(submission), true, JSON.stringify(validate.errors));
    schemaValidation = 'passed';
  }

  return {
    contract: path.relative(root, contractPath),
    providers: submission.providers.length,
    routes: submission.routes.length,
    invalidFixtures: fixtures.length,
    schemaValidation,
  };
}

async function main() {
  const result = await checkShifuDocumentationContract();
  console.log(
    `[shifu-docs] contract=${result.contract} providers=${result.providers} routes=${result.routes} rejected=${result.invalidFixtures} schema=${result.schemaValidation}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    console.error(error?.stack || String(error));
    process.exit(1);
  });
