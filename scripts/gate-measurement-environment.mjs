// SPDX-License-Identifier: Apache-2.0
// @ts-check

import fs from 'node:fs';
import path from 'node:path';

const UV_OVERLAY_SCHEMA = 'shifu.uv-cache-overlay/v1';

/**
 * Add user tool directories without shadowing the cache-managed uv wrapper.
 * The wrapper is deliberately the first PATH entry projected by Shifu.
 *
 * @param {string} currentPath
 * @param {string[]} candidates
 * @param {{managedUv?: boolean}} [options]
 */
export function gateMeasurementToolPath(
  currentPath,
  candidates,
  { managedUv = false } = {},
) {
  const current = currentPath.split(path.delimiter).filter(Boolean);
  const ordered =
    managedUv && current.length
      ? [current[0], ...candidates, ...current.slice(1)]
      : [...candidates, ...current];
  return [...new Set(ordered.filter(Boolean))].join(path.delimiter);
}

/**
 * Resolve the cache-managed uv wrapper directly. Windows may expose both
 * `Path` and `PATH`; relying on command lookup can therefore bypass the
 * wrapper even when Shifu projected it first.
 *
 * @param {{env?: NodeJS.ProcessEnv, platform?: NodeJS.Platform}} [options]
 */
export function gateMeasurementUvCommand({
  env = process.env,
  platform = process.platform,
} = {}) {
  if (env.SHIFU_CACHE_MANAGED_UV !== '1')
    return { command: 'uv', shell: false };
  const manifestPath = env.SHIFU_UV_ADAPTER_MANIFEST || '';
  if (!manifestPath)
    throw new Error('measurement uv overlay manifest is missing');
  const command = path.join(
    path.dirname(manifestPath),
    'bin',
    platform === 'win32' ? 'uv.cmd' : 'uv',
  );
  if (!fs.existsSync(command))
    throw new Error(`measurement uv wrapper is missing: ${command}`);
  return { command, shell: platform === 'win32' };
}

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
