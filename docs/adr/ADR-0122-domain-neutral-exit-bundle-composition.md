---
metadata_schema: kungfu.document-metadata/v1
doc_type: architecture-decision
adr_id: ADR-0122
decision_status: accepted
implementation_status: staged
implementation_commits: [1ae8e0aad95bc4f5873c285fd7531711b9c7f485]
closure_commit: 1ae8e0aad95bc4f5873c285fd7531711b9c7f485
qualification_refs: [framework/exit/kungfu-exit-bundle.contract.json, tests/fixtures/exit-bundle-contract/cases.json, scripts/check-exit-bundle-contract.test.mjs]
review_state: self-reviewed
sensitivity: public
sources: [local-files, user-consensus]
period: 2026-07-20
theme: domain-neutral-exit-bundle-composition
confidence: high
evidence_grade: B
last_reviewed: 2026-07-20
ai_provenance: GPT-5 via Codex on 2026-07-20; based on current Fact, Episode, Fact Library, Mission, Profile, source-export, and recovery-backup authorities; installed verifier and release evidence remain unobserved
---

# ADR-0122: Exit Bundles compose domain roots, closure, loss, capabilities, and receipts without becoming another authority

- Status: accepted; the machine contract, inventory, negative corpus, packaging
  registration, and drift gate are staged; composition,
  installed verification, clean-runtime qualification, and release admission
  remain open
- Date: 2026-07-20
- Category: portability / exit / migration / contract composition
- Related: [ADR-0018](ADR-0018-runtime-storage-service-architecture.md),
  [ADR-0053](ADR-0053-self-contained-episode-bundles.md),
  [ADR-0059](ADR-0059-mission-control-mission-go-responsibility-model.md),
  [ADR-0112](ADR-0112-backend-neutral-fact-cut-kernel.md), and
  [ADR-0113](ADR-0113-authority-atomic-storage-backend-switch.md)

## Context

Kungfu already has strong portable slices. Episode bundles carry verbatim
frames and content-addressed payloads. Fact authority and scoped Fact Cut
bundles preserve exact roots. Fact Library and Mission bundles compose Episode
identities. Profile source bundles reconstruct exact source closures. Generic
source exports carry manifest sync roots. Recovery backup packages bind a
checkpoint-covered durable frontier.

Those contracts do not use one closure vocabulary. `full`, `thin`,
`self_contained`, missing material, redaction, loss, root identity, execute,
and post-import equivalence are represented differently or not at all. A
product-level exit claim therefore requires humans to infer whether a set of
individually valid artifacts is actually sufficient to verify, materialize,
rebuild, and continue within a declared scope.

The normative machine source for this decision is
[`kungfu-exit-bundle.contract.json`](../../framework/exit/kungfu-exit-bundle.contract.json).

## Decision

### 1. The Exit Bundle is a composition manifest, not a domain bundle

`kungfu.exit-bundle/v1` owns only:

- one exact declared scope and optional Cut root;
- member ids, domain authorities, schemas, protocols, identity/content roots,
  and material descriptors;
- required members, capabilities, and equivalence levels;
- structured omissions, loss, and compatibility state;
- verification policy and the top-level bundle root.

Each member domain remains the sole authority for its own schema, root
preimage, material closure, import behavior, semantic fold, and receipt. The
top-level verifier delegates to the declared domain verifier. It does not
decode Mission, Episode, Fact, Profile, source, or backup semantics.

### 2. Full and thin are mutually exclusive machine states

A `full` bundle must be self-contained and complete for its declared scope,
have no missing required material, and not be degraded. Every required member
must be included and domain-verifiable. Any missing, withheld, redacted,
external, unsupported, or incompatible input affecting a required member or
capability makes the bundle non-full and degraded.

A `thin` bundle is always non-self-contained, incomplete for scope, missing
material, and degraded. Its maximum capabilities are `inspect` and
`verify-inventory`. It cannot claim content verification, materialization,
projection rebuild, continuation, or capability equivalence.

### 3. Equivalence is layered and explicit

The contract distinguishes:

1. exact physical bytes where a member identity requires verbatim transfer;
2. exact immutable record/object/Cut/Episode roots;
3. exact authoritative semantic state;
4. rebuilt projection equivalence; and
5. declared capability equivalence.

Copied SQLite files, GUI caches, provider directories, paths, and configuration
are never portability evidence. A provider may change while semantic roots
remain equal.

### 4. Compatibility never reinterprets an old root

Unknown top-level majors and unknown required member schemas or protocols fail
before execute. Unknown optional members restrict the whole artifact to
inventory inspection. A legacy reader may inspect and verify only the exact
historical protocol it declares. A successor contract uses a new
schema/protocol, and any identity change requires an explicit mapping receipt.
Partial compatibility is degraded and cannot produce a materialization or
continuation success receipt.

### 5. Verification and mutation are ordered

The verifier checks the top-level root before reading members, delegates exact
member-root verification, checks compatibility before execute, and preflights
the destination before mutation. Validation is the default. Execute is
explicit. Success is issued only after the requested root, semantic,
projection, and capability postflight equivalence has passed.

## Falsification and acceptance gates

The contract is false if any implementation:

- lets a thin bundle claim materialization, rebuild, continuation, or
  capability completeness;
- hides required missing/redacted/external material outside structured
  omission and loss entries;
- decodes or redefines member-domain semantics in the top-level verifier;
- accepts duplicate member ids or same-identity/different-root members;
- executes an unknown required schema or protocol; or
- emits success before destination postflight equivalence.

The corpus under
`tests/fixtures/exit-bundle-contract/cases.json` pins complete, thin, tampered,
unknown, version-mismatch, redacted, missing-member, duplicate-identity, and
conflicting-root behavior. The gate also checks the machine inventory against
the live source authorities and prevents Episode ADR or Mission schema metadata
from drifting again.

## Consequences

Kungfu gains one public vocabulary for deciding whether a bounded exit artifact
is merely inspectable or actually sufficient to verify, import, rebuild, and
continue. Existing member bundles do not change identity and no second exporter
or importer is created.

The contract alone does not compose artifacts, ship an independent verifier,
qualify a clean installed runtime, qualify provider migration in a release
artifact, or authorize destructive source retirement. Those remain subsequent
stages with their own evidence.
