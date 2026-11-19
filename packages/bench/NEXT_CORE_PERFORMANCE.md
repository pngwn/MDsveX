# Next core performance experiments

This report covers experiments run from `next` at `e7c618aa`. No code,
benchmarks, or conclusions from `main` were reused.

## Method

The shared benchmark processes the same 28,747-character corpus on every run:
the prose, code, HTML, and table fixtures. It measures direct parsing, the
public parser, cursor rendering, mapped rendering, and both end-to-end
pipelines.

Each case warms up for 300 ms and samples for 1,500 ms. Candidates were tested
in isolated copies, built before measurement, and compared with adjacent
control runs when results were close.

```sh
pnpm --filter @mdsvex/bench bench:core
```

The original `next` baseline was:

| Case | Operations/second |
| --- | ---: |
| Direct parse | 2,154.51 |
| Public parse | 2,275.81 |
| Cursor render | 6,316.48 |
| Mapped render | 2,911.37 |
| Parse and render | 1,622.25 |
| Parse and mapped render | 1,304.99 |

## Retained change

`TreeBuilder.close` now avoids reading pending and parent storage on the common
non-paragraph path. It also avoids reading pending state for dispatcher work
when no plugin dispatcher exists.

Two isolated acceptance runs averaged:

| Case | Operations/second | Change |
| --- | ---: | ---: |
| Direct parse | 2,340.34 | +8.6% |
| Public parse | 2,501.74 | +9.9% |
| Parse and render | 1,831.95 | +12.9% |
| Parse and mapped render | 1,389.58 | +6.5% |

A final pair of uncontended runs after integration averaged:

| Case | Original | Final average | Change |
| --- | ---: | ---: | ---: |
| Direct parse | 2,154.51 | 2,470.42 | +14.7% |
| Public parse | 2,275.81 | 2,521.78 | +10.8% |
| Parse and render | 1,622.25 | 1,819.83 | +12.2% |
| Parse and mapped render | 1,304.99 | 1,386.18 | +6.2% |

The range across runs reflects allocator, garbage-collector, and host noise.
The direction repeated, including lower minimum and 75th-percentile times. The
parser bundle stayed at 28.32 kB gzip; the TreeBuilder chunk remained 0.97 kB
gzip. No dependency was added.

## Rejected parser experiments

- Initializing parser arrays only in `_init` was within noise.
- Removing `TreeBuilder.id_to_kind` was inconsistent and lost against the
  retained close path in the mapped pipeline.
- Caching parser state and node stacks locally changed direction on repeat.
- A single backing `ArrayBuffer` for all NodeBuffer fields was neutral in
  parsing and added layout machinery.
- Writing text fields directly instead of using NodeBuffer setters regressed
  direct and public parsing by 5–6%.
- Installing branch-free no-plugin TreeBuilder methods per instance regressed
  parse-bearing pipelines by 6–11%.
- Treating opcode IDs as NodeBuffer indices until their first divergence was
  neutral end-to-end and worsened parser tail latency.
- Narrowing pending flags from `Uint32Array` to `Uint8Array` saved memory but
  did not produce stable throughput gains.

## Rejected renderer experiments

- A manual escape scanner, compact table writes, cached cursor kinds, early
  self-closing passthrough, and unchecked sibling traversal all failed paired
  measurements.
- Replacing the output chunk array and final `join` with incremental string
  concatenation was neutral or slower.
- Prebuilding mapping data without object spread improved against a stale
  baseline but lost against an adjacent control.
- Creating final mapping objects early grew the renderer by 0.55 kB and slowed
  mapped end-to-end rendering by 4.9%.
- A compact numeric pending-mapping buffer improved isolated mapped rendering
  by 1.4%, but regressed mapped end-to-end 75th-percentile latency by 10.5%.
- Direct generated-offset tracking grew the renderer by 1.20 kB, slowed mapped
  rendering by 3%, and was neutral end-to-end.
- Sealing completed trees so cursors could skip sibling validation stayed
  within roughly 1% and changed direction on repeat.

The current string-chunk array plus one cumulative `Uint32Array` mapping pass
was faster than all tested replacements.

## Architectural compiler session

Allowing an API-level change produced a second retained improvement.
`CompilerSession` privately reuses its TreeBuilder arena, NodeBuffer storage,
cursor, output chunks, pending mappings, and mapping-offset scratch across
sequential documents. Returned HTML and mappings are detached from that
storage, so a later compile cannot mutate a prior result.

The existing one-shot `compile` and public parser APIs are unchanged. Each
`mdsvex()` plugin instance now owns a session. Source-bound parse plugins use
the existing fresh one-shot path because their dispatcher cannot safely move
between documents.

Two shared, uncontended benchmark runs averaged:

| Case | Operations/second | Change |
| --- | ---: | ---: |
| Mapped compile, cold | 1,428.02 | — |
| Mapped compile, reused | 1,545.75 | +8.2% |
| HTML compile, cold | 1,836.94 | — |
| HTML compile, reused | 1,989.23 | +8.3% |

Against the already optimized manual parse-and-mapped-render pipeline, the
reused compiler averaged 8.4% faster. A 4,000-document allocation run reduced
sampled peak heap from 73.2 MB to 49.4 MB and typed-array peak allocation from
64.3 MB to about 120 KB. The mdsvex bundle grew by 0.49 kB gzip and no
dependency was added.

Session output and complete mapping arrays matched cold compilation in 3,864
sequential comparisons over all 962 parser fixtures, including reverse order,
mapped and unmapped output, malformed EOF input, empty input, and a
large-to-small capacity cycle. Tests also cover prior-result immutability and
the plugin fallback.

## Rejected architectural experiments

- A direct-index renderer matched HTML and mappings across all 962 parser
  fixtures, but ranged from +0.2% to -1.9% end-to-end while growing the
  renderer by 80% raw and 55% gzip.
- Compact object and forward-threaded compiler trees matched 947 repository
  documents but were consistently 8–10% slower.
- A compact SoA compiler also matched all 947 documents. Its apparent 1.7–4%
  improvement changed direction in paired runs and required another 2.26 kB
  gzip plus duplicated repair semantics, so it was not retained.

## Correctness and conclusion

The retained changes passed 2,512 parser tests and 109 renderer tests in
focused runs. The final full workspace run passed 2,760 tests, with 8 existing
todos.

This is not a hard parser ceiling: a small storage-read change still produced a
repeatable pipeline gain, and private storage reuse then produced another
architectural gain. The cursor traversal and mapped-output algorithms do appear
close to a local optimum: independently reimplementing them over direct or
compact representations did not pay for the extra code.

A future compact batch compiler should build on the proven reusable arena and
share parser repair semantics rather than duplicating them in the renderer.
