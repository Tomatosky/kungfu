# AgentSessionCapsule host, peer transport, and interaction port

`@kungfu-tech/agent-session` contains the process-lifetime boundary that owns
one provider PTY for one `SessionAttempt`. It directly spawns an absolute
executable plus argv; it never launches a persistent interactive shell.

The host stage provides:

- an injectable Capsule host with exact attempt, generation, stream-epoch and
  process-start fencing;
- a standalone local worker whose lifetime is independent of an Electron
  renderer or window;
- monotonic byte sequences, bounded replay, explicit overflow gaps and a
  printable text-grid VT snapshot;
- idempotent input delivery receipts and lifecycle receipts that never claim a
  semantic outcome or work completion;
- structured node-pty readiness diagnostics, including the known Darwin
  `spawn-helper` executable-mode failure; and
- a synthetic PTY provider covering ANSI, alternate-screen, raw input, an
  approval prompt, burst output and provider exit.

The worker's newline-JSON POSIX local socket is a Stage 2 test port, not the
public interaction transport.

The Stage 3 transport state machine adds:

- an injectable append-only journal + payload-free notice port shaped for the
  ADR-0077 mmap journal and nng wakeup planes;
- one Capsule output writer with independent cursors for every attachment;
- one generation-fenced controller lease, explicit takeover policy, input
  deduplication and expected-provider fencing;
- Coordinator re-registration without a stream-epoch reset and Supervisor
  adoption only with exact runtime/generation/process identity evidence; and
- bounded journal recovery, explicit gaps, VT snapshots, resize coalescing and
  a structural no-per-reader-fanout benchmark.

`InMemoryJournalNoticePort` is deterministic qualification infrastructure, not
a production broker. `NativeKungfuJournalNoticePort` binds the same authority
state machine to a native Watcher Peer: one public mmap journal writer carries
`kungfu.action-envelope/v1` frames and the writer's existing nng publication is
the payload-free wakeup plane. The Coordinator never proxies frame bytes and
the Capsule worker's local test socket is not a public relay.

The Stage 4 provider-neutral Interaction Port adds:

- `status`, `snapshot`, `instruct`, `sendKey`, and `interrupt` over the same
  generation-, epoch-, controller-, and foreground-fenced transport;
- deterministic `when-ready`, bounded `queue`, and interrupt-then-wait policy;
- versioned Codex `0.144.x` and Claude Code `2.1.x` redacted TUI signatures for
  `ready`, `busy`, `approval-needed`, `ended`, and `unknown`;
- one atomic bracketed-paste instruction plus one Enter, with duplicate input
  and trailing-Enter rejection; and
- visible adapter drift and opaque-shell fallback to explicit raw human input.

An automatic instruction is never delivered or queued from
`approval-needed` or `unknown`. `sendKey` is manual-only. Delivery receipts do
not contain instruction text and never claim provider understanding, semantic
outcome, work state, approval result, or interrupt result. Adapter fixtures are
synthetic and redacted. Product surfaces still belong to Stage 5.

Run the focused qualification through Shifu:

```sh
./shifu test:agent-session-capsule-host
./shifu test:agent-session-peer-transport
./shifu build:core
./shifu test:agent-session-peer-transport:native
./shifu test:agent-session-interaction-adapters
./shifu test:agent-session-interaction-adapters:native
```

The build-free source gate runs the pure host and transport tests only. Native
qualification is separate: after `build:core`, it starts a real Coordinator and
two cross-process Watcher Peers, then proves public-journal replay, nng wakeup,
cursor reconstruction and absence of a Coordinator byte proxy. The Capsule host
focused command also runs the native node-pty worker smoke; native checks stay
outside the source-only lifecycle because that runner installs dependencies
without native build scripts.

The interaction adapter native command is build-free and local-only: it checks
installed Codex and Claude Code version output under a temporary HOME without
reading provider auth, private transcripts, or hidden session databases. Real
authenticated instruction, approval/deny, and provider-outcome dogfood remains
a Stage 6 product qualification obligation.

The Codex App Server structured-hybrid contract is a separate provider adapter
stage under ADR-0084. It pins direct stdio, Codex CLI `0.144.3`, the generated
non-experimental stable schema bundle, admitted methods, provider identity, raw
retention, and recovery limits without changing the shared Interaction Port or
Claude/PTTY authority. Its committed 267-file manifest defines an independently
recomputable bundle digest; unknown versions, capabilities, methods, required
fields, or schema bytes fail closed.

Run the credential-free contract and installed-schema drift gates through
Shifu:

```sh
./shifu test:codex-app-server-contract
./shifu test:codex-app-server-contract:native
```

The native gate generates stable schema under a temporary `HOME` and
`CODEX_HOME`; it does not inspect provider auth or session state. Runtime,
normalization, recovery guards, product routing, and real authenticated dogfood
belong to later ADR-0084 implementation stages.

On Darwin, packaged products must restore the executable bit on node-pty's
`spawn-helper`. The existing Electron `afterPack` audit already owns that
repair. The Mac smoke copies node-pty into a temporary harness directory and
repairs only that disposable copy, so verification never mutates the checkout's
installed dependency tree.
