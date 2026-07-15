# Xinfa

Xinfa is **The Context Compiler for Agents**. It compiles declared project
sources into deterministic Context IR, impact graphs, bounded task capsules,
and distributable context packs with explicit provenance.

Xinfa is an independent product incubated in this repository. Its source
location is not an ownership boundary: it has its own `xinfa` CLI, `xinfa.*`
protocol namespace, version, release tag, artifacts, state, cache, license,
and extraction manifest. The core binary has no Kungfu or Shifu runtime
dependency.

## Authority

| Layer | Owns | Does not own |
| --- | --- | --- |
| Project | source documents, domain semantics, provider instances, route intent | Context IR or compiler receipts |
| Shifu | project submission protocol, conformance diagnostics, Gate execution, thin invocation adapters | a second Context IR, graph, selector, pack, or capsule compiler |
| Xinfa | Context IR, graph and impact semantics, selection, pack/capsule formats, compiler provenance | project truth, runtime facts, or release attestation |
| Kungfu | product adapters and read-only consumption of public Xinfa artifacts | Xinfa schemas, state, version, or compiler internals |
| Buildchain | exact artifact and release attestation | authoring or compiler semantics |

The dependency direction is Project sources → public submission contracts →
Xinfa compiler → public Xinfa artifacts → product adapters. Shifu may validate
and invoke that path, but it may not compile a parallel graph or pack.

## Development and standalone proof

Use the repository entrypoint while Xinfa is incubated here:

```sh
./shifu xinfa:build
./shifu xinfa:check
./shifu xinfa:standalone
```

The standalone qualification copies only the files listed in
`extraction-manifest.json` into a clean temporary directory, removes host
product environment variables, builds and tests the copied crate, and verifies
the stable CLI contract. The first retained receipt is
[`qualification/standalone-smoke-v1.json`](qualification/standalone-smoke-v1.json).
The extraction itself builds with ordinary Cargo:

```sh
cargo build --locked --manifest-path Cargo.toml
./target/debug/xinfa --version
./target/debug/xinfa contract --json
./target/debug/xinfa diagnose --json
```

Runtime state defaults to project-local `.xinfa`. Set `XINFA_STATE_HOME` and
`XINFA_CACHE_HOME` explicitly to relocate state or cache. Diagnostic commands
are read-only and do not create either directory.

The current slice freezes product identity and proves the extraction boundary.
It does not yet implement the Context IR compiler, product adapters, publishing,
or a stable release claim.
