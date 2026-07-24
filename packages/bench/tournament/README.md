# Performance tournament

This development-only harness screens many source variants against one shared,
balanced corpus. It never edits the checked-out implementation: baseline and
candidate builds live in temporary workspaces.

Every pair swaps isolated baseline and candidate builds into the same absolute
execution path, then measures them in fresh Node processes in A-B-B-A order.
This controls module-path, JIT-order, host, and thermal noise. A variant is accepted
only when its parser arena, rendered code, and mappings match the baseline
exactly across the selected corpus.

## Corpus

The corpus combines:

- a deterministic, category-balanced sample of the parser fixtures;
- the existing benchmark fixtures;
- generated prose, container, delimiter, code, Svelte, table, and HTML stress
  documents;
- optionally, a local directory of external `.md`, `.svx`, and `.svelte`
  samples.

`smoke` uses 24 fixture samples, `screen` uses 128, and `full` uses all local
fixtures. External material is never downloaded automatically. Candidate
repositories and their licenses are recorded in `external-corpora.json`;
resolve refs to immutable commits and place reviewed files in a local cache.

## Running

From the repository root:

```sh
node packages/bench/tournament/run.mjs --smoke
node packages/bench/tournament/run.mjs --screen --output /tmp/screen.json
node packages/bench/tournament/run.mjs --full --external-dir /path/to/corpus
```

Useful controls:

```sh
node packages/bench/tournament/run.mjs --smoke --limit 6
node packages/bench/tournament/run.mjs --screen --match combined
node packages/bench/tournament/run.mjs --smoke --duration 250 --warmup 80
node packages/bench/tournament/run.mjs --screen --pairs 5
```

The initial family explores parser/compiler arena sizing. Further families
should remain declarative edits in `variants.mjs` where possible. Cheap screens
are directional only: rerun winners with `--full`, the package test suites, and
the canonical `bench:core` benchmark before integrating them.

`control-rebuild` compares two independent unmodified builds. Its spread is
the local noise floor; gains smaller than twice that spread should not advance.
