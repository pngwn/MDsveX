# Tournament plan

The goal is to find improvements that local micro-benchmarks miss, including
changes to internal APIs and architecture. Runtime dependencies, public
functionality, and a small shipped library remain hard constraints.

## Measurement contract

1. Compare isolated baseline and candidate builds at the same absolute module
   path in fresh Node processes.
2. Reject candidates whose parser arena, generated code, mappings, or V3
   sourcemap differ on the selected corpus.
3. Use smoke runs only to reject broken or clearly poor ideas.
4. Automatically invalidate a bracket when the no-op control crosses the mode
   threshold. Advance screen winners only when the direction repeats in at
   least 75% of independent pairs and no important target regresses by more
   than 5%.
5. Run finalists on the full corpus, package tests, the canonical core
   benchmark, allocation/GC profiles, and bundle-size comparison.
6. Combine survivors in a semifinal because allocation and scanner gains are
   frequently non-additive.

## Brackets

### Calibration and cheap search

- Arena initial capacity and growth policies.
- Parser/session scratch-array reuse and reset strategies.
- Typed versus JavaScript parser ID scratch storage.
- Bulk text-run scanners, including native regular-expression search.
- Metadata representation and allocation frequency.

These families are cheap enough to generate dozens of declarative variants.
The capacity bracket is implemented first to calibrate the runner.

### Compiler and sourcemap architecture

- Direct numeric sourcemap tuples, followed by direct V3/VLQ emission.
- Mapping emission in generated order to remove sorting and cumulative passes.
- Streaming top-level block rendering with deferred reference-dependent blocks.
- Private compiler metadata lanes while preserving the public AST.

Direct V3 emission is the leading product-level candidate because mapped
compilation currently materializes mappings that the Vite path immediately
converts again.

### Parser architecture

- Reusable parser state across `CompilerSession` documents.
- Two-phase block/inline parsing with an escape hatch for unsupported syntax.
- Block-boundary checkpoints and per-file incremental recompilation.
- A scanner-only WASM feasibility experiment before considering a larger port.

Incremental compilation is scored separately from one-shot throughput. Its
acceptance bar is at least a 3x median improvement for representative small
edits with byte-identical cold results after every edit.

## Corpus progression

- `smoke`: balanced local samples, current benchmarks, generated stress cases.
- `screen`: 128 balanced fixtures plus the same stable stress cases.
- `full`: all 962 local fixtures and any reviewed external cache.
- `held-out`: external documentation and Svelte sources not used to choose
  parameters.

External candidates are recorded in `external-corpora.json`. Downloads must be
cached outside the repository, pinned to immutable commits, and reviewed for
license compatibility before use.

## Initial rejection thresholds

- Correctness: zero oracle differences.
- Screen: at least 2% median gain or a compelling allocation reduction.
- Final: improvement in five of six independent pairs and larger than twice the
  observed baseline noise.
- Size: architectural additions must justify their minified and gzip cost;
  a narrow optimization should normally stay below 1–1.5 kB gzip.
- Memory: reusable sessions must not retain an unreasonable high-water mark
  after compiling a large document followed by small documents.
