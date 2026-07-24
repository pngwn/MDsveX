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
pnpm --dir packages/bench exec vitest bench \
	--run benchmarks/core-next.bench.ts
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

## Correctness and conclusion

The retained change passed 2,512 parser tests and 109 renderer tests in focused
runs. The full workspace baseline passed 2,757 tests, with 8 existing todos.

This is not a hard parser ceiling: a small storage-read change still produced a
repeatable pipeline gain. The current cursor renderer and mapped-output design
do appear close to a local optimum under the existing APIs.

The next architectural step would be an explicit batch-only, no-plugin
`compileToHtml` path with private compact storage. It could avoid returning a
mutable AST, while the current parser and cursor remain the fallback for
plugins, incremental parsing, mappings, and callers that need NodeBuffer.
That changes the public performance contract, so it should have its own
benchmark and API decision rather than being presented as a transparent core
optimization.
