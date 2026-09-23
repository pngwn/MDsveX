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

## 2026-07-25 second architectural bracket

### Constant identity VLQ segments — advance

Almost every identity-run segment after the first has the exact delta tuple
`[1, 0, 0, 1]`, whose encoded form is always `,CAAC`. The original hot loop
called the VLQ encoder three times and appended five small strings for every
character. The winner appends the exact constant once and leaves boundary and
non-identity cases on the generic path.

- Shared 141-document screen: 4.743x median, four wins in four pairs.
- Canonical four-file corpus: 7.544x median, four wins in four pairs.
- Combined-worktree canonical run: 48.15 to 379.94 operations/second
  (7.89x) for legacy versus direct V3.
- Byte-identical HTML and maps across all 975 local documents.
- Relevant renderer/mdsvex tests: 114 passed.
- Bundle delta: approximately +0.12 kB raw / +0.05 kB gzip.

Grouping constants with `repeat()`, typed order scratch, and counting-order
variants were exact but rejected as flat, noisy, or disproportionate in size.

### Typed parser-ID arena — reject

The arena regressed direct parsing by 6.19% and retained roughly 926 kB after a
large-to-small workload. O(1) swap-removal also changed pending-node order,
causing two real AST snapshot regressions. It was slower, larger, and
semantically invalid.

This experiment exposed an isolation weakness when source checkouts reused an
absolute package `node_modules` symlink. The tournament now resolves the
package directory and recreates all `@mdsvex` workspace links inside each
temporary candidate tree.

### External prose classifier — reject

A pinned MIT/permissive corpus was assembled from Vite, Node, and Svelte:
489 files and 5,346,006 characters. It has 8.51% scanner-break density and
48.18% coverage by runs of at least 32 plain characters; Node API documentation
accounts for 81.4% of its bytes.

The best document classifier averaged +2.43% externally but dominant Node
documentation was consistently 3.15% slower. Local-screen pairs ranged from
+3.15% to -13.94%, and the implementation added 216 gzip bytes. Exactness and
all 2,512 parser tests passed, but the candidate did not advance. The pinned
corpus remains useful for future brackets.

## 2026-07-25 third architectural bracket

### Sparse metadata array — reject

The full local corpus contains 26,777 nodes; only 3,028 (11.31%) carry
metadata. HTML tags account for 1,987 metadata objects, followed by attributes,
links, and list state.

Replacing the sparse Map with an indexed JavaScript array remained exact and
saved 7 gzip bytes, but a valid three-pair smoke produced only +1.30% target
geomean: parse +3.13%, render +1.70%, cold compile +2.00%, reused compile
+0.14%, legacy V3 -0.77%, and direct V3 +1.64%. This did not clear the
noise-adjusted 2% gate, so private metadata lanes were not pursued.

### Generated-order direct V3 — advance

The direct renderer now emits only V3-relevant node/content anchors in
generated order. Node anchors are emitted pre-order, syntax entries and
post-order duplicates are suppressed, and the encoder bypasses sorting.
Enriched public mappings and parse-plugin compilation keep the existing path.

- Canonical direct V3: +5.45% median, four wins in four pairs.
- Shared 141-document screen: +8.82% median, four wins in four pairs.
- Combined-worktree canonical run: 379.94 to 402.48 operations/second
  (+5.93%) after the constant-segment winner.
- Exact maps across all 975 local documents with 100% direct-path coverage.
- Pending mapping entries: -45.5%; post-GC heap: -2.1%.
- Bundle delta: approximately +0.75 kB raw / +0.25 kB gzip.
- Relevant renderer/mdsvex tests: 114 passed.

### Limited two-phase parsing — reject

The conservative feasibility path remained exact but covered only 32 of 1,464
local and pinned-external documents: 0.17% of corpus characters. It regressed
smoke parsing by 8.87%, direct V3 by 6.47%, and added approximately 1.5 kB gzip
across parser and mdsvex bundles. The extra scan cannot pay for itself at that
coverage, so the experiment stopped after one counterbalanced pair.

## 2026-07-25 fourth architectural bracket

### Remaining direct V3 tail — reject

The remaining allocation and lookup variants were exact but did not clear the
4% acceptance threshold. A monotonic generated-line cursor improved the shared
screen by 1.83%, reusing line indexes improved it by 2.54%, and specialized
boundary encoding improved it by 0.77%. Repeated constant grouping was flat or
slower.

The direct V3 path is therefore at a practical local ceiling under the current
acceptance gate. The combined canonical result remains 402.48 operations/second
for direct V3 versus 48.33 for the legacy enriched-mapping path, approximately
8.33x faster.

### Incremental watch compiler — reject

A bounded watch compiler prototype retained parse/render checkpoints and
spliced direct V3 output for eligible edits. It produced exact code, public
mappings, and V3 maps across deterministic cases and 600 randomized
variable-length edits.

Eligible edits were materially faster: 5.13x median aggregate throughput and
9.62x median per-edit throughput. However, only 10 of 128 mixed-corpus edits
qualified, leaving a 92.19% fallback rate. Fallback was 7.96x slower than a
V3-only cold compile because it also materialized public mappings, retained
state was approximately 153 kB per file, and the API added 2.42 kB gzip.

An independent compact-index prototype reduced edit metadata to 1,568 bytes
for 98 spans across eight documents, compared with a 69,604-byte
character-wide segment table for the largest fixture alone. Widening its edit
eligibility changed 23 of 27 V3 maps; a boundary rewrite still differed on 15
because interleaved duplicate and node segments require more source-map state.

The current watch API does not advance. A future bracket can combine the
compact typed-span index with stored boundary checkpoints and the original
conservative eligibility proof, then attack fallback cost separately.

## 2026-07-25 fifth architectural bracket

### Direct node handles and split inline state — advance

The plugin-free parser now uses NodeBuffer indexes as its internal handles,
removing opcode-to-buffer ID translation. Custom emitters and parse plugins
retain the legacy opcode path, and direct handles require an explicit
capability so numeric return values from existing emitters remain ignored.

The monolithic parser loop was also just above V8's default TurboFan bytecode
limit. Extracting the inline state reduced `_run` below that limit; traces
confirm that both `_run` and `run_inline` now complete TurboFan optimization.

- Full local parser: +18.93% median, four wins in four pairs.
- Held-out external parser: +20.50% and +29.61%, both exact.
- Exact AST/code/mapping/V3 comparisons across all 975 local documents and
  the pinned Vite, Node, and Svelte corpus.
- Canonical public parser: 2,958.09 operations/second.
- Canonical mapped compilation: 1,610.44 cold and 1,704.17 reused.
- Canonical direct V3 compilation: 410.64 operations/second.
- Complete suite: 2,769 tests passed, 8 existing todos.

### Borrowed ParserSession — advance

`ParserSession` exposes an explicitly borrowed no-plugin parse result for
sequential workloads. The next parse or `clear()` invalidates the previous
arena. Retained node and source high-water marks are bounded, oversized
storage is discarded, and unsupported capacities are rejected.

- Local screen: +32.37% and +33.96%, both exact.
- Held-out external screen: +37.52% and +37.69%, both exact.
- Forward, reverse, and large-to-small local sequences: 2,925 exact
  comparisons.
- Canonical borrowed parser: 3,141.71 operations/second.

The final combined addition is 2,014 raw bytes and 1,504 gzip bytes across the
parser main entry, tree-builder entry, renderer, sourcemap encoder, and mdsvex
bundle. The tournament now includes the separately shipped tree-builder entry
in its size gate.

### Compact parse tape — reject

The packed tape itself consumed events 1.32x faster than TreeBuilder, but
replaying it into the public arena erased the gain. Shared-screen parsing
regressed by 15.96% with zero wins in four pairs, added 812 gzip bytes, and
retained approximately 9.93 bytes per source character. A tape remains useful
only if a future renderer consumes it directly.

### Lazy identity-mapped builder — reject in semifinal

The API-preserving lazy builder was independently valid: public parsing gained
10.51%, cold compilation 18.79%, and reused compilation 9.04%. It matched
1,464 local and pinned-external documents plus 10,007 malformed/random
differentials.

It lost the head-to-head semifinal to direct handles plus the inline split on
the representative parse and compile pipelines, while adding 1,420 gzip bytes
before ParserSession. The combined direct architecture was also approximately
15.5% faster on the longer external parse confirmation, so the lazy builder
was not integrated.
