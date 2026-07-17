// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildHumanSurfaceInventory,
  humanSurfaceXinfaProject,
} from './shifu-documentation-surfaces.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('human surface inventory and Xinfa submission are deterministic', () => {
  const first = buildHumanSurfaceInventory({ root: ROOT });
  const second = buildHumanSurfaceInventory({ root: ROOT });
  assert.equal(second.inventoryRoot, first.inventoryRoot);
  assert.deepEqual(second.entries, first.entries);
  assert.equal(first.closure.unclassified, 0);
  assert.equal(
    first.closure.humanSurfacePaths,
    new Set(first.entries.map((entry) => entry.path)).size,
  );

  const project = humanSurfaceXinfaProject(first);
  assert.equal(
    project.providers[0].paths.length,
    first.closure.exactProviderPaths,
  );
  assert.equal(
    project.nodes.length,
    first.entries.length +
      new Set(first.bindings.map((binding) => binding.targetId)).size,
  );
  assert.deepEqual(project.routes[0].nodes, project.routes[1].nodes);
  assert.match(project.providers[0].revision, /^sha256:[0-9a-f]{64}$/);
});

test('implementation revision drift is preserved as a Xinfa document dependency mismatch', () => {
  const inventory = buildHumanSurfaceInventory({ root: ROOT });
  const binding = inventory.bindings[0];
  const drifted = {
    ...inventory,
    bindings: inventory.bindings.map((candidate) =>
      candidate.id === binding.id
        ? { ...candidate, observedRevision: `sha256:${'0'.repeat(64)}` }
        : candidate,
    ),
  };
  const project = humanSurfaceXinfaProject(drifted);
  const document = inventory.entries.find(
    (entry) =>
      entry.path === binding.documentPath && entry.kind === 'document-file',
  );
  const target = project.nodes.find((node) => node.id === binding.targetId);
  const dependency = project.nodes
    .find((node) => node.id === document.node)
    .verification.dependencies.find((item) => item.node === binding.targetId);

  assert.equal(target.revision, `sha256:${'0'.repeat(64)}`);
  assert.equal(dependency.expectedRevision, binding.expectedRevision);
  assert.notEqual(dependency.expectedRevision, target.revision);
  assert.ok(
    project.routes.every(
      (route) =>
        route.nodes.includes(document.node) &&
        route.nodes.includes(binding.targetId),
    ),
  );
});

test('an eligible surface without a classification fails closed', () => {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'shifu-surface-negative-'),
  );
  try {
    fs.writeFileSync(path.join(temporary, 'orphan.md'), '# Orphan\n');
    fs.writeFileSync(
      path.join(temporary, 'policy.json'),
      JSON.stringify({
        $schema:
          'https://libkungfu.dev/schemas/shifu/documentation-surface-policy-v1.schema.json',
        schema: 'shifu.documentation-surface-policy/v1',
        project: 'fixture',
        discovery: { trackedOnly: true, extensions: ['.md'] },
        classifications: [
          {
            id: 'known',
            lifecycle: 'authored',
            documentProfile: 'authored-document',
            verificationProfile: 'human-review',
            visibility: 'public',
            owner: 'fixture-docs',
            waiver: null,
            selectors: { paths: ['known.md'] },
          },
        ],
        explicitSurfaces: [],
        bindings: [],
        routes: [
          {
            id: 'human',
            audience: 'human',
            parityGroup: 'fixture',
            entrypoints: ['orphan.md'],
          },
          {
            id: 'agent',
            audience: 'agent',
            parityGroup: 'fixture',
            entrypoints: ['orphan.md'],
          },
        ],
      }),
    );
    assert.throws(
      () =>
        buildHumanSurfaceInventory({
          root: temporary,
          policyRef: 'policy.json',
          files: ['orphan.md'],
        }),
      /unclassified human surfaces: orphan\.md/,
    );
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
