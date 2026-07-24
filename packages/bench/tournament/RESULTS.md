# Tournament log

## 2026-07-25 foundation and calibration

The tournament runner, corpus builder, correctness oracle, isolated build
workspaces, and initial capacity family are operational.

The shared smoke corpus contains 37 documents and 104,424 characters:

- 24 category-balanced parser fixtures;
- 5 existing benchmark fixtures;
- 8 deterministic generated stress documents.

All initial candidates produced byte-identical parser arenas, HTML, mapping
arrays, and V3 sourcemaps on that corpus.

### Canonical baseline

The existing 28,747-character `core-next` benchmark completed successfully.
Selected rates:

| Metric | Operations per second |
| --- | ---: |
| parse public | 2,719 |
| render cursor | 6,169 |
| render mapped | 3,068 |
| parse and render mapped | 1,468 |
| compile mapped cold | 1,363 |
| compile mapped reused | 1,545 |
| compile cold | 1,870 |
| compile reused | 2,008 |

These numbers are a run record, not a new long-term baseline; paired tournament
comparisons remain authoritative.

### Calibration result

Short fixed-time runs were rejected because slow full-corpus passes quantized
into too few samples. The runner now calibrates once and compares an identical
number of complete passes at the same absolute module path.

A four-entry smoke bracket was also rejected: its no-op rebuilt control showed
an outlying 36% cold-compile movement. That makes every apparent candidate gain
from the same bracket non-credible. No capacity candidate advanced.

The next run should use at least four balanced pairs and longer measurement
windows. The no-op control remains in every bracket so noisy host conditions
invalidate the bracket instead of promoting a false winner.

### Regression result

The complete workspace regression suite passed: 49 test files and 2,760 tests,
with the existing 8 todo cases unchanged.

## Next bracket

The first architectural bracket should compare:

1. parser scratch-array reuse in `CompilerSession`;
2. a native bulk text-run scanner;
3. direct numeric and V3 sourcemap emission.

Direct V3 emission is the leading compiler experiment. The current Vite path
materializes mapping objects and then immediately converts them again, leaving
more plausible headroom than the already-tight HTML string builder.

## 2026-07-25 first architectural bracket

### Direct V3 emission — advance

The fused renderer/session path sorts renderer entries and streams identity
runs directly into V3. It avoids allocating public Mapping objects,
one-element arrays, and expanded per-character Segment objects. The existing
Mapping APIs remain unchanged, and parse-plugin calls retain the enriched
mapping fallback.

- Exact HTML and serialized V3 maps across 975 documents / 217,032 characters.
- Shared 141-document screen: median +4.07%, four wins in four pairs.
- Canonical four-file bracket: conservative median +4.18%, six wins in six.
- Final short confirmation after incremental line tracking: +6.30%.
- Combined-worktree canonical run: 48.22 to 51.27 operations/second
  (+6.31%) for legacy versus direct V3.
- Complete suite: 2,762 tests passed, 8 existing todos.
- Bundle delta: +2.34 kB raw / approximately +0.59 kB gzip.

The conservative claim remains +4% until another full tournament run confirms
the final inner-loop refinement.

### Parser scratch reuse — reject

Unconditional retained scratch improved reused mapped compilation by 3.62% in
five of five screen pairs, but regressed one-shot parsing by 11.27%. Scoping
reuse to CompilerSession removed the parse regression but also removed the
repeatable target gain: median reused compilation was -0.30%, winning two of
five pairs. It also retained roughly 0.9 MB more heap after a large-to-small
workload. No scratch variant was integrated.

### Bulk text scanning — reject

A native regexp scanner improved long plain prose by 55%, but regressed mixed
syntax. The best scalar-prefix/regexp hybrid retained a 30.52% prose gain while
regressing code by 2.03% and HTML by 1.15%. On the shared 141-document screen,
parser throughput was 6.39% lower with disagreeing pairs. No scanner variant
was integrated.

This family may be worth revisiting only as a document-level prose-specialized
path after an external corpus establishes that the weighting is representative.
