---
metadata_schema: kungfu.document-metadata/v1
document_status: active
doc_type: analysis
review_state: self-reviewed
sensitivity: internal
sources: [local-files]
period: 2026-07-19
theme: adr-0049-native-storage-closure
confidence: high
evidence_grade: A
last_reviewed: 2026-07-19
---

# Native storage closure

This slice qualifies the ADR-0049 `libkungfu` product boundary through the
versioned `kungfu/native_storage.h` C ABI. The consumer links `libkungfu`
directly and uses no Python, Node, Rust host, GUI, cloud, or database service.

The fixture creates a `.kungfu` workspace and exercises one native authority
loop for Episodes, domain Facts, the generic Fact Kernel, and the Fact Library.
It creates immutable objects, versions, relations, Cuts, refs, declarations,
observations, admissions, and library materials; then closes and reopens the
native context, queries stable roots, rebuilds disposable projections, runs
fsck, and verifies authority export/import into a fresh runtime.

The same fixture covers stale expected-old rejection, missing declaration and
admission, fenced stale-Episode recovery, interrupted backend copy followed by
resume and rollback, projection loss, and corrupt import rejection. Every
operation delegates to the existing runtime storage service; the ABI transports
UTF-8 JSON edge projections and does not implement a second storage model.

The v1 contract is single-thread-affine. One borrowed result can be outstanding
per context and must be explicitly released. ABI version mismatch, unsupported
operations, busy ownership, invalid input, and core failure are distinct status
codes. `context_last_error` exposes a borrowed diagnostic until the next call.

This v1 surface remains the ADR-0120 compatibility adapter over the canonical
storage service, not a claim that UTF-8 JSON is the final semantic ABI. Python
and Node bindings are clients of the same authority and are not required for
recovery, retry policy, queries, backend lifecycle, or the native closure gate.

Run the repository gate:

```text
KUNGFU_BUILD_SKIP_PYKUNGFU=1 KUNGFU_BUILD_SKIP_KUNGFU_NODE=1 ./shifu qualify:embedding-membranes
```
