#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import { lifecycleEnvironment, runShifu } from './run-shifu-lifecycle.mjs';

const env = lifecycleEnvironment({
  ...process.env,
  KUNGFU_BUILDCHAIN_NO_OPTIONAL: '1',
  KUNGFU_BUILDCHAIN_SOURCE_BUILD: '1',
  SHIFU_NATIVE: '1',
  SHIFU_REQUIRE_MSVC: '1',
  KUNGFU_FUZZ_SECONDS: '90',
});

const stages = [
  ['verify', '--fuzz'],
  [
    'episode:qualify:release',
    '--',
    '--output',
    'product/release/qualification/episode-release-evidence.json',
  ],
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
];

for (const args of stages) {
  const status = runShifu(args, { env });
  if (status !== 0) process.exit(status);
}
