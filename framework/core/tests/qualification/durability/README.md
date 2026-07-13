# Durability Qualification Harness

This directory owns the process-crash evidence tier for ADR-0068. It keeps
durability correctness separate from mmap performance and from later
disposable-volume, VM, or physical-device power-loss evidence.

Every invocation is a dry run unless `--execute` is explicit:

```sh
./shifu durability:qualify -- \
  --profile macos-apfs-process-v1 \
  --durability-profile durable_group
```

After reviewing that plan, a retained local run uses an immutable report path:

```sh
./shifu durability:qualify -- \
  --profile macos-apfs-process-v1 \
  --durability-profile durable_group \
  --filesystem apfs \
  --report /tmp/kungfu-durable-group-macos.json \
  --execute
```

Use `linux-ext4-process-v1` with `--filesystem ext4` on the Linux
qualification host and `windows-ntfs-process-v1` with `--filesystem ntfs` on
the Windows qualification host. Run `durable_group` and `durable_sync`
separately so each receipt profile has its own report.

The harness executes only local Shifu tasks. It does not dispatch GitHub
workflows or self-hosted runners. It retains each suite's raw output beside the
report and binds the report to the source revision, tree, profile digest,
platform facts, Shifu doctor record, fault matrix, and exact result. The Episode
suite runs the complete `mvp-smoke-v1` accumulation, contention, and semantic
oracle gate; a semantic-only invocation is not accepted as load evidence.

## Claim boundary

A passing v1 report qualifies only its declared process-crash proxy envelope.
The report schema hard-codes both `power_loss_qualified` and
`production_profile_eligible` to `false`. Process termination, deterministic
fault injection, restart, recovery, projection rebuild, Episode oracle, and
backup/restore evidence cannot be promoted into a sudden-power-loss or device
cache claim.

Disposable volume/VM/device evidence, real ENOSPC, performance ceilings, soak,
and production profile activation remain separate later tiers. Their absence
is a passing report's explicit non-claim, not an ignored test.

## Disposable power-cut fixture

`./shifu durability:powercut:fixture` builds a small native worker for the
later VM/device tier. It can stop at every append, data-sync, checkpoint,
directory-sync, and post-receipt boundary, then verify the checkpoint-covered
record chain after a fresh boot. Building or running its non-interrupting
smoke path is not power-loss evidence; only an external disposable-VM
orchestrator may terminate the guest after the worker emits
`KF_POWER_CUT_ARMED`.

The worker fails closed unless both safeguards are present:

- `KUNGFU_DURABILITY_QUALIFICATION=disposable-powercut`;
- a pre-existing data root containing
  `.kungfu-disposable-powercut-fixture` with the exact
  `kungfu.durability.disposable-root/v1` sentinel.

Never place that sentinel in a user journal or production data root. The
fixture does not create, mount, format, terminate, or restart a VM or storage
device; those destructive actions belong to a separately reviewed,
dry-run-first orchestrator and retained machine report.

The Linux device-tier preflight is generated without side effects:

```sh
./shifu durability:powercut:plan -- \
  --run-id 12dd26e899-linux-ext4-v1 \
  --repo /data/worktrees/kungfu/feature/durability-qualification-final \
  --source-revision "$(git rev-parse HEAD)" \
  --image kungfu-linux-build-probe:conanfix-20260630T101847Z \
  --kernel-release 6.8.0-134-generic \
  --kernel-version 6.8.0-134.134
```

Run the command from the exact isolated repository worktree named by `--repo`;
the shell substitution binds the plan to that worktree's full commit. The
result is a `dry-run-only` JSON plan. It refuses arbitrary repository and
workspace roots, names every host mutation, leaves physical hosts and devices
out of scope, and separates the exact armed marker from the direct-child QEMU
termination step. Every profile/fault trial creates a small guest-root qcow2
overlay and a pristine raw ext4 data image, so sequence state and guest writes
cannot leak across trials while qcow2 stays outside the tested durability
device. The plan is evidence for review, not authorization to run the mutating
commands.

The raw data drive uses QEMU `cache=none,aio=native`; write and verification
boots use different root overlays. After the guest emits its exact verification
completion marker it remains alive as PID 1, and the host runner terminates only
that direct QEMU child. This avoids treating a missing guest init-system
`poweroff` helper as durability evidence.

## Files

- `profiles/*.json` freezes the platform/filesystem process profiles.
- `schemas/durability-qualification-profile-v1.schema.json` validates profiles.
- `schemas/durability-qualification-report-v1.schema.json` validates reports.
- `run.mjs` owns dry-run planning, local execution, raw evidence, and verdicts.
- `run.test.mjs` proves fail-closed platform, marker, and claim behavior without
  entering a compiler or build lifecycle.
- `powercut_plan.mjs` freezes the disposable Linux ext4/QEMU write set and fault
  matrix without executing it.
- `powercut_guest_init` is the guest-only init entrypoint copied into the
  disposable root image; it cannot create or terminate a host VM.
