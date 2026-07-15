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
  const configured =
    ignore === undefined ? [] : Array.isArray(ignore) ? ignore : [ignore];
  // osx-sign 1.3.3 drops array ignores during option normalization.
  return (filePath) =>
    PYTHON_BYTECODE.test(filePath) ||
    configured.some((rule) =>
      typeof rule === 'function' ? rule(filePath) : filePath.match(rule),
    );
}

export async function sign(options) {
  await signAsync({
    ...options,
    identity: resolveMacSigningIdentity(options),
    ignore: resolveMacSigningIgnore(options.ignore),
  });
}
