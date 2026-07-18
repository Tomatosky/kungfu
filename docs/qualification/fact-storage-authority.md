# Fact storage authority qualification

This page states which parts of Kungfu's current fact-storage substrate are
authoritative and implemented, which parts are projections, and which larger
claims remain unqualified. It is an evidence index, not a new storage contract.
The audited source baseline is `c7906973c65259a5d18848f6468e8d5a7f43dfc7`.

## Current answer

Kungfu has an implemented embedded content-addressed fact-storage kernel. The
immutable `content_store` contract and dependency-free file backend are owned by
`libyijinjing`; engine-backed implementations are injected from `libkungfu`.
RocksDB is an optional runtime provider, not a kernel dependency. Python and
Node expose thin bindings over the same C++ surface. Typed source and manifest
catalog journals remain authority; SQLite is rebuildable projection state.

This does **not** qualify a fleet storage service, sharding, object-store cold
tiering, a general mutable KV contract, destructive retention/GC, distributed
query, PB capacity, physical-power-loss durability, or production eligibility.

## Authority and reachability matrix

| Concern | Authority | Current reachability | Evidence | Boundary |
| --- | --- | --- | --- | --- |
| Immutable content identity | SHA-256 content hash in `libyijinjing` | Implemented C++ contract: `put_if_absent`, `get`, `has`, `verify` | `storage/content_store.h`; content-store slice | No mutable overwrite or delete semantics |
| Dependency-free embedded backend | `libyijinjing::file_content_store` | Implemented; atomic temp-file publication, verified reads, declared capabilities | `storage/content_store.cpp`; `slices/content-store/run.mjs` | Single-node embedded profile |
| Concrete engine boundary | `libyijinjing` interface; `libkungfu` implementation | Mechanically enforced against engine includes, symbols, and links | `libyijinjing/check-deps.mjs` and seeded self-test | RocksDB cannot become a kernel dependency |
| RocksDB content backend | `libkungfu` storage provider | Implemented behind the same content-store contract | `runtime/storage/provider.cpp`; Python and Node provider tests | One process-owned handle; not shared multi-process storage |
| Provider lifecycle | `libkungfu` provider cache | One provider per canonical runtime directory and profile for the process lifetime | PR #485; concurrent facade tests | No fleet service or cross-process ownership claim |
| Provider authority and migration | Atomic backend binding generation in `libkungfu` | File↔RocksDB copy, cross-process shared/exclusive write fence, semantic-root verification, resumable state, retained-provider rollback, and Python/Node/CLI receipts | ADR-0112; `test_storage_backend_switch.py`; Node authority-atomic binding test | Single-host operation/authority locks; no cross-machine consensus or destructive source cleanup |
| Language bindings | C++ runtime storage service | Python and Node expose symmetric thin facades | `py-runtime.cpp`; `kungfu_node.cpp`; binding tests | JSON/bytes are edge forms, not a second semantic root |
| Source and manifest catalogs | yijinjing append-only Hana POD journals | Implemented typed folds, fsck, rebuild, import/export receipts | `source_registry.h`; `manifest_catalog.h`; `test_atlas_storage.py` | JSON is an edge projection; SQLite is rebuildable |
| Fact admission | KFD-1 declaration plus journaled admission history | Initial declaration, observation, admission, correction/retraction, and historical query path implemented | ADR-0051; `fact_admission.h`; `test_atlas_storage.py` | Admission is not universal external truth |
| Fact query | C++ query basis, logical plan, authority scan, and lineage | Implemented staged query surface over pinned declarations and cuts | `fact_query.h`; ADR-0048 tests | Broader SQL/distributed query qualification is separate |
| Integrity and portability | Journal/catalog authority plus content hashes and manifests | Local fsck, bundle import/export, provider round trips, and Episode payload resolution implemented | storage and Episode tests | Not arbitrary journal repair or remote range/hash sync |
| Durability | Typed facts and named ADR-0068 profiles | Default-off current-hardware candidate evidence exists | durability qualification and retained evidence | Physical power loss and production eligibility remain false |

Paths in the table are relative to `framework/core/src/libyijinjing/include/kungfu/yijinjing/`,
`framework/core/src/libkungfu/src/`, or `framework/core/tests/` as applicable.

## Lifecycle reconciliation

- ADR-0018 is `accepted` and `staged`: its provider-neutral service, typed
  catalogs, query, fsck, bundle, projection rebuild, and dry-run maintenance
  slices exist, while destructive maintenance and cross-machine sync do not.
- ADR-0037 is `accepted` and `implemented`: source and manifest catalog records
  are typed journal authority; JSON and SQLite are projections.
- ADR-0040 is `accepted` and `implemented` for its embedded first delivery.
  PRs [#476](https://github.com/kungfu-systems/kungfu/pull/476),
  [#480](https://github.com/kungfu-systems/kungfu/pull/480), and
  [#485](https://github.com/kungfu-systems/kungfu/pull/485) close the contract,
  engine injection, binding symmetry, and provider lifecycle gaps. Their commits
  are included in the published
  [`shifu-v4.0.0-alpha.0`](https://github.com/kungfu-systems/kungfu/releases/tag/shifu-v4.0.0-alpha.0)
  tag.
- ADR-0112 is `accepted` and `staged`: the binding, resumable bidirectional
  operation, write fence, rollback, multisurface receipts, and temporary-root
  qualification fixtures are implemented on the current branch; immutable PR
  evidence is recorded only after review and mainline merge.
- ADR-0051 is `accepted` and `implemented` for the initial KFD-1 declaration and
  admission path; broader domain scaffolding remains incremental.
- ADR-0068 remains `accepted` and `staged`; its evidence boundary is authoritative
  for durability claims and is not widened by content-store release inclusion.

## Reproduction

Run the focused checks from the repository root:

```sh
node framework/core/src/libyijinjing/check-deps.mjs --self-test
node framework/core/src/libyijinjing/check-deps.mjs
cmake -S framework/core -B framework/core/build -DKUNGFU_WITH_SLICES=ON
cmake --build framework/core/build --target content_store_probe
node framework/core/slices/content-store/run.mjs
python -m pytest framework/core/tests/python/test_content_store_facade.py framework/core/tests/python/test_storage_backend_switch.py
node --test framework/core/tests/storage-node-binding.test.js
./shifu adr:audit -- --json
./shifu docs:check
./shifu check:source
```

The CMake and binding checks require the repository's normal native build
environment. Passing documentation and source checks alone does not substitute
for the native content-store and binding tests.
