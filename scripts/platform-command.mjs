// SPDX-License-Identifier: Apache-2.0

const WINDOWS_SHIMS = new Set(['npm', 'npx', 'pnpm']);

export function platformCommand(command, platform = process.platform) {
  return platform === 'win32' && WINDOWS_SHIMS.has(command)
    ? `${command}.cmd`
    : command;
}
