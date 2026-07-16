---
metadata_schema: kungfu.document-metadata/v1
doc_type: architecture-decision
adr_id: ADR-0105
decision_status: accepted
implementation_status: staged
implementation_prs: []
qualification_refs: [framework/core/tests/python/test_atlas_storage.py, extensions/work-dashboard/tests/mission-control-profile.test.ts, framework/core/src/python/kungfu/agent/kfd3_api.registry.json]
review_state: self-reviewed
sensitivity: public
sources: [local-files, user-consensus]
period: 2026-07-16
theme: independent-review-exact-continuation
confidence: high
evidence_grade: B
last_reviewed: 2026-07-16
---

# ADR-0105: Completion review is independent, root-bound, and mechanically continuable

- Status: accepted; implementation stage-ready
- Date: 2026-07-16
- Category: Mission Control / KFD-2 / KFD-3 / Project Cut
- Related: [ADR-0052](ADR-0052-kfd2-assessment-lifecycle-and-executors.md),
  [ADR-0059](ADR-0059-mission-control-mission-go-responsibility-model.md),
  [ADR-0097](ADR-0097-project-cut-spacetime-and-publication-boundary.md), and
  [ADR-0104](ADR-0104-native-mission-go-authority-cutover.md)

## Context

A claimant can report that work is complete, but the report cannot certify
itself. A reviewer who depends on the claimant's chat transcript merely moves
the context bus from one person to another. The handoff must instead pin the Go
set, acceptance, input and result Atlas roots, Project Cut, Git object, sealed
Episodes, proof roots, known gaps, and evidence availability.

Thin settled history is sufficient for ordinary root and state inspection but
not necessarily for raw replay, forensics, or requalification. Treating every
missing full artifact as lost history creates false blocks; treating it as fit
creates false confidence.

## Decision

### 1. A Completion Claim is one exact evidence envelope

`claim-completion` records the claimant and Go set together with acceptance,
input/result Atlas, Project Cut, Git commit/tree, Episode/proof roots, known
gaps, and per-acceptance `thin` or `full` evidence availability. Git commits and
content roots retain their own identity domains. The claim does not become a
decision merely because it was admitted.

### 2. Independent review uses a different actor and source

`review-completion` rejects a reviewer whose actor identity equals the
claimant. It executes the existing purpose-bound completion assessment over the
selected exact cut, producing an Assessment Episode and TrustReport, then seals
the reviewer's findings and deterministic continuation plan under independent
roots. It never modifies the claimant's Episode.

The verdict vocabulary is exactly `fit`, `partial`, `insufficient`,
`conflicted`, `stale`, or `unverifiable`. Missing thin evidence is insufficient.
Unavailable full evidence contracts the applicable capability and yields an
exact evidence request instead of erasing otherwise readable settled history.

### 3. Continuation is exact-root and bounded

`decide-continuation` requires the expected review root and continuation-plan
root. A stale root or an action outside the verdict's declared action set fails
before a decision fact is admitted. One plan may contain at most six follow-up
Go rows with explicit dependencies, acceptance root, and `why_created`.

An agent may materialize only mechanical follow-ups. Mission, authority,
privacy, security, public-claim, irreversible, and stop decisions require a
human actor. This gate is domain data and runtime enforcement, not a prompt
convention.

### 4. The v3 fact contract remains stable

Review and continuation records use versioned record kinds on the existing
`kungfu.mission-control.completion-claim` surface. They carry distinct actor,
Episode, payload, review, TrustReport, and plan roots, but do not add or rewrite
the already materialized v3 fact-surface register. This is an additive Profile
upgrade after the authority cutover, not a hidden KFD-1 contract migration.

### 5. GUI, CLI, and agents share the same actions

The Work Dashboard reviewer panel, CLI commands, and public Agent catalog invoke
the same Profile actions and receipts. The generated KFD-3 registry is the
public discovery surface; no GUI-only reviewer state or private continuation
script owns authority.

## Falsification and acceptance gates

- same-actor review is rejected before an independent review fact is written;
- forged, stale, conflicted, missing, or unverifiable evidence cannot produce
  `fit`;
- unavailable full evidence remains a visible capability contraction and exact
  request, while available thin evidence remains usable;
- wrong review or plan roots reject continuation;
- non-mechanical agent decisions reject with `human-decision-required`;
- a valid mechanical plan creates only its bounded follow-up Go rows; and
- CLI, Agent, and GUI projections expose the same claim, review, verdict,
  decision, and continuation roots.

## Consequences

A new reviewer can evaluate a Completion Claim without the execution thread's
chat, and a third agent can continue from the resulting Go plan. The additional
root inputs make handoff more explicit, and retained full evidence may still be
required for deep capabilities. The design deliberately prefers a visible
`partial` or evidence request over either false closure or a blanket history
failure.
