---
metadata_schema: kungfu.document-metadata/v1
document_status: active
period: ongoing
theme: kungfu-core-build-profiles
doc_type: architecture-map
sources: [local-files]
confidence: high
sensitivity: public
evidence_grade: B
review_state: self-reviewed
last_reviewed: 2026-07-15
---

# Core Build Profiles

This file is a checked projection of [`build-capabilities.json`](build-capabilities.json).
The authority references component ownership from [`layers.json`](layers.json); it does not define a second layer graph.

Default profile: `full`. Planned profiles fail closed until their qualification work is complete.

| Profile | Status | Components | Providers | Projections | Bindings | Dependency roots |
| --- | --- | --- | --- | --- | --- | --- |
| `journal` | supported | `journal-core` | — | — | `cxx` | `fmt`<br>`nlohmann-json`<br>`spdlog`<br>`xxhash` |
| `embedded-minimal` | supported | `journal-core`<br>`storage-provider-sdk` | `custom-content-store` | — | `cxx` | `fmt`<br>`nlohmann-json`<br>`spdlog`<br>`xxhash` |
| `embedded-sqlite` | supported | `journal-core`<br>`runtime-contracts`<br>`runtime-services`<br>`runtime-adapters`<br>`composition` | `file-storage` | `sqlite-projection`<br>`sqlite-state-cache`<br>`sqlite-query-acceleration` | `cxx`<br>`c` | `flatbuffers`<br>`fmt`<br>`nlohmann-json`<br>`nng`<br>`rxcpp`<br>`spdlog`<br>`sqlite`<br>`sqlite-orm`<br>`tabulate`<br>`xxhash` |
| `server` | planned | `journal-core`<br>`runtime-contracts`<br>`runtime-services`<br>`runtime-adapters`<br>`composition` | `file-storage`<br>`rocksdb-storage`<br>`rocksdb-live-kv` | `sqlite-projection`<br>`sqlite-state-cache`<br>`sqlite-query-acceleration` | `cxx`<br>`c`<br>`python`<br>`node` | `flatbuffers`<br>`fmt`<br>`libnode`<br>`nlohmann-json`<br>`nng`<br>`pybind11`<br>`rocksdb`<br>`rxcpp`<br>`spdlog`<br>`sqlite`<br>`sqlite-orm`<br>`tabulate`<br>`xxhash` |
| `full` | supported | `journal-core`<br>`runtime-contracts`<br>`runtime-services`<br>`runtime-adapters`<br>`composition` | `file-storage`<br>`rocksdb-storage`<br>`rocksdb-live-kv` | `sqlite-projection`<br>`sqlite-state-cache`<br>`sqlite-query-acceleration` | `cxx`<br>`c`<br>`python`<br>`node`<br>`electron`<br>`wasm` | `flatbuffers`<br>`fmt`<br>`libnode`<br>`nlohmann-json`<br>`nng`<br>`pybind11`<br>`rocksdb`<br>`rxcpp`<br>`spdlog`<br>`sqlite`<br>`sqlite-orm`<br>`tabulate`<br>`xxhash` |

## Build identity

Schema: `kungfu.core-build-identity/v1`.

- `authority_version`
- `profile`
- `components`
- `providers`
- `projections`
- `bindings`
- `dependency_roots`
- `live_capability`
- `build_root`
- `source_revision`
- `compiler`
- `compiler_version`
- `platform`
- `architecture`

## Gate

```sh
./shifu check:source
```

The source gate rejects unknown references, incomplete component closure, a planned default, target dependency drift, projection drift, or a build identity that omits required roots.
