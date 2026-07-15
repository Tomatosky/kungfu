// SPDX-License-Identifier: Apache-2.0
// @ts-check

import fs from 'node:fs';
import path from 'node:path';

const UV_OVERLAY_SCHEMA = 'shifu.uv-cache-overlay/v1';

/**
 * Project the cache-managed uv environment into the long-lived measurement
 * process after `uv sync` materializes it through the child-only wrapper.
 *
 * @param {string} projectRoot
 * @param {{env?: NodeJS.ProcessEnv, manifestPath?: string}} [options]
 */
export function exposeGateMeasurementPython(
  projectRoot,
  {
    env = process.env,
    manifestPath = env.SHIFU_UV_ADAPTER_MANIFEST || '',
  } = {},
) {
  if (env.UV_PROJECT_ENVIRONMENT) return env.UV_PROJECT_ENVIRONMENT;
  if (!manifestPath) return '';
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (
    manifest.schema !== UV_OVERLAY_SCHEMA ||
    !Array.isArray(manifest.projects)
  )
    throw new Error('measurement uv overlay manifest is invalid');
  const expected = path.resolve(projectRoot);
  const project = manifest.projects.find(
    (candidate) => path.resolve(candidate.source || '') === expected,
  );
  if (!project?.environment || !path.isAbsolute(project.environment))
    throw new Error(`measurement uv overlay does not declare ${expected}`);
  if (!fs.existsSync(project.environment))
    throw new Error(
      `measurement uv environment is not materialized: ${project.environment}`,
    );
  env.UV_PROJECT_ENVIRONMENT = project.environment;
  return project.environment;
}
