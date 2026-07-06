# @kungfu-tech/sdk

SDK for assembling Kungfu applications.

The platform model (see `framework/core/docs/adr/ADR-0006` and `ADR-0011`):
the core provides capability — typed, in-process, zero-copy access to runtime
data — and applications are thin shells over it. This package scaffolds such
an application on the reference stack (electron-vite + React + TypeScript +
biome), wired to load the native binding the same way the reference GUI does.

## Usage

The toolkit is the `kungfu sdk` subcommand of the platform CLI (there is no
separate `kfs` command):

```sh
kungfu sdk create app my-app   # scaffold into ./my-app
cd my-app
pnpm install
pnpm dev                       # launch against a built @kungfu-tech/core
```

It also scaffolds view extensions (kfx) — installable view packages the
reference shell discovers and mounts (see `docs/extensions.md` in the
repository root for the contract):

```sh
kungfu sdk create extension my-view   # scaffold into ./my-view
cd my-view
pnpm install
pnpm build                     # kungfu sdk kfx build → dist/view/index.js
npm pack                       # the tgz installs via `kungfu kfx install`
```

Options (both `create` targets):

- `--name <name>` — product/view name (defaults to the directory basename).
- `--workspace` — wire platform dependencies as `workspace:*` when
  scaffolding inside the monorepo.

The generated app is self-contained: `pnpm pack` produces a distributable
bundle with the kungfu runtime under `Resources/kungfu`.

## KFD-1 Contract Prototype

The first KFD-native SDK slice adopts existing contract source files without
overwriting them. It proves that the SDK can resolve the single KFD-1 registry
and reproduce the registered surfaces as canonical JSON evidence:

```sh
kungfu sdk contract adopt config --source framework/config/kungfu-config.contract.json --json
kungfu sdk contract adopt kfx --source framework/kfx/kungfu-kfx.contract.json --json
kungfu sdk contract adopt skill --source framework/skill/kungfu-skill.contract.json --json

kungfu sdk contract render config --check --json
kungfu sdk contract render kfx --check --json
kungfu sdk contract render skill --check --json

kungfu sdk contract evidence --json
```

`adopt` is read-only: the registry and contract files remain the source of
truth. `render --check` reports canonical JSON equivalence and also exposes
whether the current file is byte-for-byte identical to SDK-rendered output. The
prototype keeps normal checks read-only.

When a maintainer explicitly wants the SDK to write, two commands are available:

```sh
kungfu sdk contract render <surface> --write --json
kungfu sdk contract add <surface> [--source framework/contract/<surface>.contract.json] --json
```

`render --write` canonicalizes the registered source contract file and reports
the previous and new hashes. `contract add` creates a minimal source contract
and appends the matching registry entry. It also writes a deterministic
`framework/contract/fixtures/<surface>.contract-evidence.json` fixture that a
future release gate can compare with `contract evidence`.

`contract evidence [surface] --json` is read-only local evidence for KFD-1. It
reports the registry source of truth, source/rendered hashes, byte-for-byte
canonicalization status, extra artifacts, and any probe fixture. It is shaped
for future Buildchain consumption but does not enforce release policy by itself.
Neither write command is used by default by the read-only checks above.
