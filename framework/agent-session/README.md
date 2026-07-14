# AgentSessionCapsule host and peer transport

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
the Capsule worker's local test socket is not a public relay. Codex and Claude
semantic adapters belong to Stage 4, and product surfaces belong to Stage 5.

Run the focused qualification through Shifu:

```sh
./shifu test:agent-session-capsule-host
./shifu test:agent-session-peer-transport
./shifu build:core
./shifu test:agent-session-peer-transport:native
```

The build-free source gate runs the pure host and transport tests only. Native
qualification is separate: after `build:core`, it starts a real Coordinator and
two cross-process Watcher Peers, then proves public-journal replay, nng wakeup,
cursor reconstruction and absence of a Coordinator byte proxy. The Capsule host
focused command also runs the native node-pty worker smoke; native checks stay
outside the source-only lifecycle because that runner installs dependencies
without native build scripts.

On Darwin, packaged products must restore the executable bit on node-pty's
`spawn-helper`. The existing Electron `afterPack` audit already owns that
repair. The Mac smoke copies node-pty into a temporary harness directory and
repairs only that disposable copy, so verification never mutates the checkout's
installed dependency tree.
