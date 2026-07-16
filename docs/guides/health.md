# Check Kungfu health

`kungfu health` gives a user-level answer before you start or resume work. It
projects the existing runtime, Peer, storage, and Episode facts into one report;
it does not create a second authority for any of them.

Start with the bounded check:

```sh
kungfu health
kungfu health --json
```

Use the complete read-only check when the fast result asks for more evidence:

```sh
kungfu health --deep
kungfu health --deep --json
```

Fast mode reads runtime status, declared Peer status, storage metadata, and at
most 100 recent Episodes. It never runs storage `fsck`. Deep mode additionally
runs the existing read-only storage integrity scan and evaluates every open
Episode through the fenced recovery planner.

## Result states and exit codes

| Status | Exit | Meaning |
| --- | ---: | --- |
| `ready` | 0 | The checked facts are consistent. An inactive daemonless workspace is normal. |
| `degraded` | 1 | Work may continue, but an optional or recent condition deserves attention. |
| `action-required` | 2 | A user decision or reviewed plan is required before the affected operation. |
| `blocked` | 3 | Kungfu cannot prove the affected state is safe. Preserve it and inspect the evidence. |

The JSON shape is `kungfu.health-report/v1`. Every problem is a
`kungfu.diagnostic.problem/v1` with both a stable diagnostic `code` and the
underlying `sourceCode`, a user-facing explanation, retryability, action
requirement, technical detail, subject coordinates, and zero or more
non-destructive suggested commands.

Inspect the exact contract with either command:

```sh
kungfu health --contract --json
kungfu contract show diagnostics --json
```

## What health never does

Health is observational. Both modes refuse to:

- start, stop, restart, or signal a process;
- repair a runtime route;
- rebuild or apply a storage projection;
- append an Episode terminal record;
- treat unknown process, writer, or I/O outcomes as safe.

Suggested recovery commands stop at status, inspection, `fsck`, or a dry-run
plan. A command that can write still requires a separate explicit authorization.

## Common results

- A first-use workspace with no runtime directory is `ready`; health does not
  create the directory just to inspect it.
- A stopped supervisor or coordinator is not itself a fault. Storage-only work
  remains daemonless, and ordinary live-required work can activate the runtime.
- A running PID whose process-start identity does not match is `blocked`.
  Kungfu never controls it by PID alone.
- A declared Peer that intentionally stopped is healthy. A crash loop, lost
  control, orphan, or unknown ownership reports the declared Peer identity and
  the read-only status command to run next.
- An open Episode with a live writer is normal. A recent writer-less Episode is
  degraded; a stale, proven-inactive Episode becomes action-required and links
  only to `storage episode recover --plan`; unknown writer liveness is blocked.
- Deep storage findings distinguish rebuildable projection drift from failures
  in authoritative journals, manifests, payloads, or source heads.

The decision and failure semantics are frozen in
[ADR-0106](../adr/ADR-0106-unified-read-only-product-diagnostics.md).
