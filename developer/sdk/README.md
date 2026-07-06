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
```

`adopt` is read-only: the registry and contract files remain the source of
truth. `render --check` reports canonical JSON equivalence and also exposes
whether the current file is byte-for-byte identical to SDK-rendered output. The
prototype intentionally does not provide `--write`.
