# Recover a Kungfu workspace

`kungfu recover` turns the current runtime, Peer, storage, and Episode health
findings into one reviewable plan. Planning is the default and does not change
the workspace:

```sh
kungfu recover
kungfu recover --json
```

The plan reports one of three action classes:

| Class | Meaning |
| --- | --- |
| `automatic-safe` | Idempotent activation or rebuilding of a declared derived projection. |
| `confirmation-required` | Peer lifecycle or stale Episode state will change. |
| `manual-blocked` | Kungfu cannot prove ownership, authority, or outcome well enough to execute. |

Keep the complete `planId`. Execute only after reviewing the targets and
preconditions:

```sh
kungfu recover --execute --plan-id sha256:...
```

If the plan contains confirmation-required actions, approve them explicitly:

```sh
kungfu recover --execute --plan-id sha256:... --approve all
kungfu recover --execute --plan-id sha256:... --approve peer.restart:...
```

Use repeated `--action` options to run a reviewed subset. A manual-blocked
action can never be selected for execution.

## Why a reviewed plan can still be refused

Execution regenerates the plan immediately before writing. If any health fact,
target, generation, process identity, Peer declaration, writer lease, or
Episode manifest position changed, the old `planId` is rejected and you must
review a new plan. Each underlying service also retains its own fence at the
actual write point.

This is intentional: a plan is authorization evidence, not a lock on the
workspace.

## Receipts and partial outcomes

Machine-readable execution returns `kungfu.recovery-receipt/v1`:

```sh
kungfu recover --execute --plan-id sha256:... --approve all --json
```

Each action is `succeeded`, `failed`, or `not-run`, with its native result or
technical error. Kungfu stops after the first failure and then runs a fresh deep
health postflight.

Recovery is not a global transaction. If one action succeeds and a later action
fails, the successful change is not silently rolled back. Keep the receipt,
inspect the postflight, and generate a new plan.

## Safety boundary

The unified entry can:

- activate a daemonless runtime through its existing host;
- start or restart a declared Peer through its lifecycle controller;
- rebuild only the declared source-registry or Episode-manifest projection from
  authoritative journals;
- append an abort record for a stale, open Episode after writer and manifest
  fences pass.

It cannot repair unknown or corrupted authoritative facts, take over a process
whose identity is unverified, execute a future unregistered projection repair,
restore lost media, or claim rollback across components. Those cases remain
`manual-blocked` with the technical evidence preserved.

Inspect the shared contract with:

```sh
kungfu recover --contract --json
kungfu contract show diagnostics --json
```

The authority boundary and acceptance gates are frozen in
[ADR-0109](../adr/ADR-0109-fenced-unified-recovery-entry.md).
