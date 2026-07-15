# Kungfu Gate measurement coverage

This report is generated from
[`measurement-coverage.json`](measurement-coverage.json). Do not hand-edit the
generated block.

A measured observation is an immutable result from one clean source revision;
it does not update when later code changes. Re-run the Gate and register its new
receipt when its implementation or expected cost changes. Any Gate outside the
frozen 2026-07-14 adoption baseline must have a passing observation for every
declared platform before the catalog check succeeds.

Task and argv Gates use ordinary Shifu receipts. Handler Gates use controller
receipts captured from the exact successful workflow job declared by
`workflow-bindings.json`; their duration is the controller job wall time, not a
fabricated local handler duration. `scripts/register-gate-measurements.mjs`
only retires a baseline entry when one source and registry revision covers the
Gate's complete platform set.

<!-- BEGIN GENERATED GATE MEASUREMENTS -->
| Gate | Coverage | Source-bound observations |
| --- | --- | --- |
| `gate.catalog` | measured | [linux: 483 ms @ dafa97ee1](../evidence/gate-measurements/dafa97ee1/linux/runtime-toolchain-receipt.json)<br>[macos: 729 ms @ dafa97ee1](../evidence/gate-measurements/dafa97ee1/macos/runtime-toolchain-receipt.json)<br>[windows: 1940 ms @ dafa97ee1](../evidence/gate-measurements/dafa97ee1/windows/runtime-toolchain-receipt.json) |
| `governance.dco` | measured | [linux: 12000 ms @ e90b0fb2b](../evidence/gate-measurements/e90b0fb2b/linux/governance.dco.controller-receipt.json) |
| `governance.adr-delivery` | measured | [linux: 38 ms @ 6b451a4e5](../evidence/gate-measurements/6b451a4e/linux/receipt.json)<br>[macos: 111 ms @ 6b451a4e5](../evidence/gate-measurements/6b451a4e/macos/receipt.json)<br>[windows: 101 ms @ 6b451a4e5](../evidence/gate-measurements/6b451a4e/windows/receipt.json) |
| `governance.buildchain-config` | measured | [linux: 9000 ms @ e90b0fb2b](../evidence/gate-measurements/e90b0fb2b/linux/governance.buildchain-config.controller-receipt.json) |
| `governance.promotion-rehearsal` | measured | [linux: 425 ms @ e90b0fb2b](../evidence/gate-measurements/e90b0fb2b/linux/receipt.json)<br>[macos: 1100 ms @ e90b0fb2b](../evidence/gate-measurements/e90b0fb2b/macos/receipt.json)<br>[windows: 2483 ms @ e90b0fb2b](../evidence/gate-measurements/e90b0fb2b/windows/receipt.json) |
| `source.acceptance` | measured | [linux: 29120 ms @ eb32cfac3](../evidence/gate-measurements/eb32cfac3/linux/source-acceptance-receipt.json) |
| `source.changed-scope` | adoption baseline | — |
| `source.whole-tree` | adoption baseline | — |
| `docs.contracts` | measured | [linux: 5735 ms @ 77c65cc63](../evidence/gate-measurements/77c65cc63/linux/light-receipt.json)<br>[macos: 17360 ms @ 77c65cc63](../evidence/gate-measurements/77c65cc63/macos/light-receipt.json)<br>[windows: 14897 ms @ 77c65cc63](../evidence/gate-measurements/77c65cc63/windows/docs-contracts-smoke-receipt.json) |
| `docs.prose` | measured | [linux: 28123 ms @ 44d498750](../evidence/gate-measurements/44d498750/linux/docs-prose-receipt.json) |
| `docs.external-links` | measured | [linux: 51272 ms @ da9dce514](../evidence/gate-measurements/da9dce514/linux/linux-only-receipt.json) |
| `shifu.workspace` | adoption baseline | — |
| `product.distribution` | measured | [linux: 214835 ms @ dafa97ee1](../evidence/gate-measurements/dafa97ee1/linux/runtime-toolchain-receipt.json)<br>[macos: 302172 ms @ dafa97ee1](../evidence/gate-measurements/dafa97ee1/macos/runtime-toolchain-receipt.json)<br>[windows: 556869 ms @ dafa97ee1](../evidence/gate-measurements/dafa97ee1/windows/runtime-toolchain-receipt.json) |
| `product.verify-full` | adoption baseline | — |
| `product.verify-fuzz` | adoption baseline | — |
| `release.artifact-admission` | adoption baseline | — |
| `layers.contract` | measured | [linux: 436 ms @ e90b0fb2b](../evidence/gate-measurements/e90b0fb2b/linux/receipt.json)<br>[macos: 613 ms @ e90b0fb2b](../evidence/gate-measurements/e90b0fb2b/macos/receipt.json)<br>[windows: 1954 ms @ e90b0fb2b](../evidence/gate-measurements/e90b0fb2b/windows/receipt.json) |
| `layers.format` | measured | [linux: 16349 ms @ e90b0fb2b](../evidence/gate-measurements/e90b0fb2b/linux/receipt.json)<br>[macos: 5827 ms @ e90b0fb2b](../evidence/gate-measurements/e90b0fb2b/macos/receipt.json)<br>[windows: 8437 ms @ e90b0fb2b](../evidence/gate-measurements/e90b0fb2b/windows/receipt.json) |
| `layers.sdk` | measured | [linux: 10505 ms @ c4ba70d95](../evidence/layer-gates/c4ba70d95/linux-x64.raw/layer-artifact-gate-receipt.json)<br>[macos: 14200 ms @ c4ba70d95](../evidence/layer-gates/c4ba70d95/macos-arm64.raw/layer-artifact-gate-receipt.json)<br>[windows: 18834 ms @ c4ba70d95](../evidence/layer-gates/c4ba70d95/windows-x64.raw/layer-artifact-gate-receipt.json) |
| `layers.surfaces` | measured | [linux: 9979 ms @ c4ba70d95](../evidence/layer-gates/c4ba70d95/linux-x64.raw/layer-artifact-gate-receipt.json)<br>[macos: 23536 ms @ c4ba70d95](../evidence/layer-gates/c4ba70d95/macos-arm64.raw/layer-artifact-gate-receipt.json)<br>[windows: 32821 ms @ c4ba70d95](../evidence/layer-gates/c4ba70d95/windows-x64.raw/layer-artifact-gate-receipt.json) |
| `layers.release` | adoption baseline | — |
| `episode.smoke` | adoption baseline | — |
| `episode.release` | adoption baseline | — |
| `embedding.membranes` | measured | [linux: 415922 ms @ 1cb3069c0](../evidence/gate-measurements/1cb3069c0/linux/embedding-receipt.json)<br>[macos: 643891 ms @ 1cb3069c0](../evidence/gate-measurements/1cb3069c0/macos/embedding-receipt.json)<br>[windows: 791614 ms @ 1cb3069c0](../evidence/gate-measurements/1cb3069c0/windows/embedding-receipt.json) |
| `mmap.contracts` | adoption baseline | — |
| `mmap.performance` | measured | [linux: 2555 ms @ 77c65cc63](../evidence/gate-measurements/77c65cc63/linux/mmap-performance-receipt.json)<br>[macos: 1404 ms @ 77c65cc63](../evidence/gate-measurements/77c65cc63/macos/mmap-performance-receipt.json) |
| `durability.contracts` | adoption baseline | — |
| `state-service.contracts` | adoption baseline | — |
| `profile.suite` | measured | [linux: 5390 ms @ e90b0fb2b](../evidence/gate-measurements/e90b0fb2b/linux/receipt.json)<br>[macos: 13262 ms @ e90b0fb2b](../evidence/gate-measurements/e90b0fb2b/macos/receipt.json)<br>[windows: 8306 ms @ e90b0fb2b](../evidence/gate-measurements/e90b0fb2b/windows/receipt.json) |
| `profile.lifecycle` | adoption baseline | — |
| `profile.agent-sdk` | adoption baseline | — |
| `profile.kfd3` | adoption baseline | — |
| `runtime.durable-ingest` | measured | [linux: 14583 ms @ dafa97ee1](../evidence/gate-measurements/dafa97ee1/linux/runtime-toolchain-receipt.json)<br>[macos: 2492 ms @ dafa97ee1](../evidence/gate-measurements/dafa97ee1/macos/runtime-toolchain-receipt.json)<br>[windows: 3433 ms @ dafa97ee1](../evidence/gate-measurements/dafa97ee1/windows/runtime-toolchain-receipt.json) |
| `runtime.projection-bootstrap` | measured | [linux: 2611 ms @ dafa97ee1](../evidence/gate-measurements/dafa97ee1/linux/runtime-toolchain-receipt.json)<br>[macos: 4938 ms @ dafa97ee1](../evidence/gate-measurements/dafa97ee1/macos/runtime-toolchain-receipt.json)<br>[windows: 3340 ms @ dafa97ee1](../evidence/gate-measurements/dafa97ee1/windows/runtime-toolchain-receipt.json) |
| `runtime.crash-recovery` | measured | [linux: 17759 ms @ dafa97ee1](../evidence/gate-measurements/dafa97ee1/linux/runtime-toolchain-receipt.json)<br>[macos: 15014 ms @ dafa97ee1](../evidence/gate-measurements/dafa97ee1/macos/runtime-toolchain-receipt.json)<br>[windows: 6810 ms @ dafa97ee1](../evidence/gate-measurements/dafa97ee1/windows/runtime-toolchain-receipt.json) |
| `runtime.errors` | measured | [linux: 699 ms @ dafa97ee1](../evidence/gate-measurements/dafa97ee1/linux/runtime-toolchain-receipt.json)<br>[macos: 1703 ms @ dafa97ee1](../evidence/gate-measurements/dafa97ee1/macos/runtime-toolchain-receipt.json)<br>[windows: 1988 ms @ dafa97ee1](../evidence/gate-measurements/dafa97ee1/windows/runtime-toolchain-receipt.json) |
| `toolchain.cpp-modules` | measured | [linux: 1380 ms @ dafa97ee1](../evidence/gate-measurements/dafa97ee1/linux/runtime-toolchain-receipt.json)<br>[macos: 2103 ms @ dafa97ee1](../evidence/gate-measurements/dafa97ee1/macos/runtime-toolchain-receipt.json)<br>[windows: 4501 ms @ dafa97ee1](../evidence/gate-measurements/dafa97ee1/windows/runtime-toolchain-receipt.json) |
| `toolchain.libwasm-cache` | adoption baseline | — |
<!-- END GENERATED GATE MEASUREMENTS -->
