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
