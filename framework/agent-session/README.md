# AgentSessionCapsule PTY host

`@kungfu-tech/agent-session` contains the process-lifetime boundary that owns
one provider PTY for one `SessionAttempt`. It directly spawns an absolute
executable plus argv; it never launches a persistent interactive shell.

This stage provides:

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
public interaction transport. Runtime Peer registration, controller leases,
Coordinator re-registration and supervisor adoption belong to Stage 3. Codex
and Claude semantic adapters belong to Stage 4, and product surfaces belong to
Stage 5.

Run the focused qualification through Shifu:

```sh
./shifu test:agent-session-capsule-host
```

The build-free source gate runs the pure host tests only. The focused command
also runs the native node-pty worker smoke; it is intentionally not part of the
source-only lifecycle because that runner installs dependencies without native
build scripts.

On Darwin, packaged products must restore the executable bit on node-pty's
`spawn-helper`. The existing Electron `afterPack` audit already owns that
repair. The Mac smoke copies node-pty into a temporary harness directory and
repairs only that disposable copy, so verification never mutates the checkout's
installed dependency tree.
