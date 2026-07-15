# Kungfu release admission

Kungfu product publication is deny-by-default. The project policy is
[`release-admission-policy.json`](./release-admission-policy.json); the
independent consumer verifier is
[`scripts/verify-kungfu-release-admission.mjs`](../../../scripts/verify-kungfu-release-admission.mjs).
The verifier delegates the project-neutral sealed publication protocol to the
exact Buildchain runtime declared by the policy, then independently rechecks
Kungfu's current Gate registry, release profile, workflow authority, channels,
product identity, and required Linux/macOS/Windows coverage.

## Required evidence

A qualifying capability must bind all of the following exact values:

| Dimension | Required proof |
| --- | --- |
| Source | one 40-character Kungfu revision and its release-candidate tree |
| Gate policy | current `shifu.gates.json`, `release-promotion` matrix digest, complete passing rows and platform receipts |
| Runtime | Buildchain `2.12.7` at `52dba6d30051b53d6f6b723fa6e27b090ce4311f` and its contract digest |
| Controller | qualifying source/runtime-bound Buildchain controller receipt referenced by the RC passport |
| Runner | qualifying ephemeral, reimaged, or measured persistent-runner provenance; unqualified is denied |
| Control plane | fresh passing Actions, branch/ruleset, Environment, OIDC, publisher, and runner audit facts |
| Artifact | recomputed manifests and every product payload byte for the exact RC platform set |
| Target | Kungfu Episodes, `kungfu-product`, exact version, and only `alpha` or `release` |
| Freshness | unique nonce, no replay, and no more than 15 minutes from issue to expiry |

The verifier ignores a producer's own allow/deny statement. It recomputes the
Buildchain registry, admission, controller, Gate aggregate, runner,
control-plane, manifest, payload, and capability digests. Missing expected
fields are errors, not wildcards. Unreadable external audit state fails closed.

## Three different publication meanings

- **Test evidence publication** uploads logs, receipts, or failure reports. It
  runs even after a failed Windows attempt where the workflow contract says
  `always()`. It never grants product capability.
- **Product artifact publication** writes packages or release assets and
  requires a fresh sealed capability.
- **Channel promotion** moves `alpha` or `release` to an exact already-qualified
  source and requires the same capability chain.

The current Buildchain stable controller accepts sealed inputs but receives no
fallback self-certification from Kungfu. If admission evidence is missing, the
promotion remains blocked. A failing canary is therefore useful evidence of a
consumer/runtime gap; it is never rewritten as a qualifying release.

## Verification and diagnosis

Run the static and negative contract suite:

```text
./shifu check:gate-catalog
./shifu test:release-admission
```

For a collected evidence directory, invoke the verifier with exact JSON files:

```text
./shifu verify:release-admission \
  --admission admission.json \
  --runner-provenance runner.json \
  --control-plane-audit control-plane.json \
  --publication-evidence publication-evidence.json \
  --expected expected.json \
  --used-nonces used-nonces.json
```

The command prints a `kungfu.release-admission-capability/v1` object only after
both the Buildchain protocol and Kungfu policy pass. It does not publish.
