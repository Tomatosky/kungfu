#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import { pathToFileURL } from 'node:url';

import {
  lifecycleEnvironment,
  runShifuWithCache,
} from './run-shifu-lifecycle.mjs';

const env = lifecycleEnvironment({
  ...process.env,
  KUNGFU_BUILDCHAIN_NO_OPTIONAL: '1',
  KUNGFU_BUILDCHAIN_SOURCE_BUILD: '1',
  SHIFU_NATIVE: '1',
  SHIFU_REQUIRE_MSVC: '1',
  KUNGFU_FUZZ_SECONDS: '90',
});

export function releaseQualificationStages(platform = process.platform) {
  const stages = [['verify', '--fuzz']];
  if (platform === 'linux') {
    stages.push([
      'episode:qualify:release',
      '--',
      '--output',
      'product/release/qualification/episode-release-evidence.json',
    ]);
    stages.push([
      'adr:release:gate',
      '--',
      '--github-event',
      '--allow-non-pr',
      '--report',
      'product/release/qualification/adr-release-admissibility.json',
    ]);
  }
  stages.push([
    'gate',
    'run',
    'layers.format',
    'layers.sdk',
    'layers.surfaces',
    '--capability',
    'node',
    '--capability',
    'native-toolchain',
    '--capability',
    'product-artifacts',
    '--capability',
    'rust',
    '--receipt',
    'product/release/qualification/layer-artifact-gate-receipt.json',
    '--overwrite',
  ]);
  return stages;
}

export function main() {
  for (const args of releaseQualificationStages()) {
    const status = runShifuWithCache(args, { env });
    if (status !== 0) return status;
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exit(main());
