// SPDX-License-Identifier: Apache-2.0

import { signAsync } from '@electron/osx-sign';

const CERTIFICATE_HASH = /^[A-F0-9]{40}$/i;
const PYTHON_BYTECODE = /(?:^|[\\/])__pycache__(?:[\\/]|$)|\.py[co]$/i;

export function resolveMacSigningIdentity(options, env = process.env) {
  const configured = env.CSC_NAME?.trim();
  return configured && CERTIFICATE_HASH.test(configured)
    ? configured
    : options.identity;
}

export function resolveMacSigningIgnore(ignore) {
  const configured = ignore === undefined ? [] : [ignore].flat();
  return [...configured, (filePath) => PYTHON_BYTECODE.test(filePath)];
}

export async function sign(options) {
  await signAsync({
    ...options,
    identity: resolveMacSigningIdentity(options),
    ignore: resolveMacSigningIgnore(options.ignore),
  });
}
