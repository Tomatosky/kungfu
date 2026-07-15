---
metadata_schema: kungfu.document-metadata/v1
document_status: active
period: 2026-06-01/2026-07-15
theme: kungfu-core-architecture-health
doc_type: generated-health-report
sources: [local-files]
confidence: high
sensitivity: public
evidence_grade: A
review_state: self-reviewed
last_reviewed: 2026-07-15
---

# Core Architecture Health

Generated from the architecture authority and repository facts. Metrics are structural signals, not individual performance measures. Binary size and successful affected-native timing remain unknown until retained qualification artifacts exist.

Authority root: `sha256:4a16ab24a91d1156b073e724c8adcdc61c8f116caebdb924f4c59c84dee0f478`

| Metric | Current | Baseline | Budget | Policy |
| --- | ---: | ---: | ---: | --- |
| `component_cycles` | 0 | 0 | 0 | blocking |
| `maximum_component_fanout` | 11 | 11 | 11 | blocking |
| `maximum_public_header_propagation` | 12 | 12 | 12 | blocking |
| `maximum_responsibility_utilization_percent` | 93 | 93 | 100 | blocking |
| `maximum_component_churn` | 318 | 318 | 318 | advisory: Historical coupling is diagnostic; ordinary development must not be blocked by commit volume alone. |
| `affected_native_duration_ms` | unknown | unknown | 1200000 | advisory: The first GitHub-hosted Linux affected-native receipt will promote this retained observation into a blocking ratchet. |
| `binary_size_bytes` | unknown | unknown | advisory | advisory: PR source authority has no stable packaged artifact; release qualification retains binary-size evidence. |
| `external_dependency_closure` | 8 | 8 | 12 | blocking |

Findings: none.
