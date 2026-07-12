#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import { pathToFileURL } from 'node:url';

import { lifecycleEnvironment, runShifu } from './run-shifu-lifecycle.mjs';

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
  if (platform === 'linux')
    stages.push([
      'episode:qualify:release',
      '--',
      '--output',
      'product/release/qualification/episode-release-evidence.json',
    ]);
  stages.push(
    ['pack:spec'],
    [
      'layers:qualify:format',
      '--',
      '--report',
      'product/release/qualification/layer-format-report.json',
    ],
    ['pack:sdk'],
    [
      'layers:qualify:sdk',
      '--',
      '--report',
      'product/release/qualification/layer-sdk-report.json',
    ],
    [
      'layers:qualify:surfaces',
      '--',
      '--report',
      'product/release/qualification/layer-surface-report.json',
    ],
  );
  return stages;
}

export function main() {
  for (const args of releaseQualificationStages()) {
    const status = runShifu(args, { env });
    if (status !== 0) return status;
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exit(main());
