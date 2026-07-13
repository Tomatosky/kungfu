---
metadata_schema: kungfu.document-metadata/v1
doc_type: architecture-decision
adr_id: ADR-0073
decision_status: accepted
implementation_status: not-started
review_state: self-reviewed
sensitivity: public
sources: [local-files, user-decision]
period: 2026-07-13
theme: profile-level-kfd3-qualification
confidence: high
evidence_grade: B
last_reviewed: 2026-07-13
---

# ADR-0073: Kungfu qualifies one KFD-3 collaboration protocol for conforming Profiles

- Status: accepted; implementation in progress
- Date: 2026-07-13
- Category: Profile runtime / KFD-3 / dual-first product interface
- Related: [ADR-0061](ADR-0061-agent-mediated-guidance-is-a-first-class-product-interface.md),
  [ADR-0069](ADR-0069-agent-first-kfx-profile-suite-runtime.md)

## Context

ADR-0069 lets an installed Kungfu author and operate domain-neutral Profile Suites without rebuilding the Product.
The current contract binds KFD-1 facts, KFD-2 claims and policies, actions, views, permissions, migrations and
qualification. That is not by itself KFD-3. A schema-valid Profile may still expose a GUI-only mutation, an Agent-only
command, hidden constraints or two clients that disagree about the plan, authorization, receipt or selected cut.

Requiring every Profile author to hand-build a GUI, CLI, Agent brief and closure audit would repeat product engineering
and make KFD-3 depend on author skill. Treating the presence of any GUI and any CLI as KFD-3 would be a false claim.

## Decision

### 1. Profile authors declare collaboration semantics; Kungfu owns their projection

A conforming Profile may bind one content-addressed `kfd3.collaboration` facet. It declares participants, material
intents, value, constraints, known limits, authority classes and presentation hints. It cannot declare its own Profile
root, qualification result, witness or runtime authority.

Kungfu projects that declaration into:

- a generic Human GUI when no custom View is supplied;
- an Agent-discoverable brief, capabilities and JSON CLI/API operations;
- one shared application protocol:
  `inspect -> advise -> preview -> authorize -> execute -> receipt -> verify`;
- qualification probes and a content-bound collaboration-interface witness.

### 2. KFD-3 is an earned Profile level, not an alias for KFD-1/KFD-2

The `kfd3` facet is optional for backward compatibility. A Profile without it remains a valid KFD-1/KFD-2 Profile but
cannot be reported as KFD-3 declared or qualified. A Profile with it is only declared until closure qualification
passes. User-visible states must distinguish schema validity, KFD-1, KFD-2 and KFD-3 qualification.

### 3. GUI and Agent clients have no separate mutation authority

Both clients use the same plan identity, authorization decision, application service, receipt, cut and verify result.
A custom KFX View may change presentation but cannot append facts, grant permissions or execute a material intent
outside that service. A reachable participant-facing entrypoint that is absent from the collaboration registry fails
closure rather than becoming an undocumented API.

### 4. Qualification proves collaboration closure, not universal external truth

The KFD-3 receipt binds the Profile root, collaboration facet root, runtime contract, public surface inventory, probe
evidence, maturity and known limits. It proves the declared participant interface is discoverable, constraint-transparent
and closed for that artifact. It does not prove that a user's source assertion is true, that the named actor owns a
real-world identity, or that a domain action achieved its purpose.

### 5. Existing KFD-3 authority remains single-source

Profile qualification consumes the existing Kungfu/Buildchain KFD-3 collaboration-interface registry and witness
contract. It does not introduce a second KFD definition, registry or release passport. Profile evidence is a scoped
projection into that authority.

## Invariants and falsification

- Removing `kfd3` keeps an existing Profile valid but makes KFD-3 qualification unavailable.
- Changing one collaboration byte changes the Profile content closure and invalidates stale plans/witnesses.
- Missing value, constraints, known limits, participant identity, intent stage or public entrypoint classification fails
  KFD-3 qualification.
- Human and Agent probes over the same intent must return the same plan, receipt and verified cut.
- A custom View with a private mutation path fails qualification.
- A GUI-only, prose-only or unregistered reachable surface fails closure.

## Consequences

- Users can define domain workflows while Kungfu supplies the repeated dual-first product mechanics.
- Profiles that only need the generic renderer require declarations, not TS/React code.
- Custom presentation remains possible without becoming a second authority.
- The Profile lifecycle gains a new qualification level and witness surface, but Core remains domain-neutral.
- Mission Control must qualify through the same public path and receives no private KFD-3 exception.

## Delivery stages

1. Add the optional content-bound collaboration facet and negative contract fixtures.
2. Add closure parsing, roots, qualification state and public Python/Node/CLI services.
3. Project generic GUI and Agent surfaces over the shared intent protocol.
4. Add reverse audit, no-bypass tests and Buildchain witness emission.
5. Qualify an independent Profile and regress Mission Control in a frozen Product.
