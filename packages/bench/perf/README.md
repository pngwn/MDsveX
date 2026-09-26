# Performance harness

This harness compares a candidate build of mdsvex against a fixed reference
build and checks that both produce the same output. Its purpose is to tell a
real 1 to 3% change from noise **before** anyone starts optimising.

The Vitest suites in `../benchmarks/` are still useful for exploring. They
cannot separate a small win from noise, though. Each run is a separate
process, nothing is paired, there is no noise floor and nothing checks the
output.

The design is ported from twinkleplop's `lib/bench/perf/`. Most of the rules
below come from measurement mistakes that twinkleplop actually made. Each rule
states which mistake it prevents, so that nobody removes it as ceremony.

Keep the harness and the corpus unchanged while you run experiments. Every
report records a hash of both. If either one needs to change, change it in a
separate commit and calibrate again.

## Setup (once per machine)

```bash
node packages/bench/perf/bin/setup-baseline.mjs [--ref <commit>] [--force]
```

This exports the reference commit (default `next`, falling back to
`origin/next`) twice with `git archive`. The copies go to
`<main checkout>/.perf/baseline` and `.perf/baseline-mirror`. It then runs
`pnpm install --frozen-lockfile` and builds `@mdsvex/parse`,
`@mdsvex/render` and `mdsvex` in each copy. `.perf/REFERENCE.json` records
the SHA and the install and build times, which are about 13 seconds per copy.

The main checkout is found through `git rev-parse --git-common-dir`, so all
worktrees share one reference. `MDSVEX_PERF_DIR` overrides the location. The
script empties the directory's contents rather than deleting the directory,
because in CI the directory can be a mount point.

```bash
node --expose-gc packages/bench/perf/bin/calibrate.mjs --rounds 15
```

This measures the harness against itself and writes `calibration.json`, which
takes about ten minutes. **Calibration is per checkout.** `calibration.json`
sits next to the harness, describes one machine, and is gitignored. Run
calibration again in each checkout you measure from, and whenever the machine,
the Node version, the corpus or the round count changes. `ab.mjs` warns when it
has no calibration, or when the calibration came from a different corpus.

## Running a comparison

Build the candidate first. Both arms load `dist`, because `dist` is what users
import. Timing the TypeScript source through a transform would measure the
transform instead.

```bash
pnpm --filter ./packages/parse --filter ./packages/render --filter ./packages/mdsvex -r build
node --expose-gc packages/bench/perf/bin/ab.mjs --suite core --label my-idea
node packages/bench/perf/bin/parity.mjs
```

`ab.mjs` compares this checkout against `.perf/baseline`. Use `--candidate`
and `--baseline` to compare other checkouts. The command prints the rows past
the noise floor, then geomeans by mode, family and document, then the run
integrity (anchor drift, floor, and the corpus and harness hashes). It writes a
JSON report to `reports/`, or to the path given with `--out`. It exits with 1
if any row is slower past the floor.

`parity.mjs` checks that the two arms produce identical output. A speedup that
changes output does not count as a speedup.

Other options: `--families`, `--modes` (where `incremental` means both chunk
sizes), `--rounds` (default 15), `--repeat` (default 1), `--target-ms`,
`--rewarm-ms`, `--noise-floor <pct>` and `--verbose`.

## Measurement method

**One process for both arms.** Each arm's `dist` files are imported by
absolute path. Node caches ES modules by resolved URL, and render's bare
`@mdsvex/parse/cursor` import resolves through that checkout's own workspace
link. The result is two separate module graphs in one process. `ab.mjs`
refuses to run if the arms share a module instance or if the candidate drops
an export. In twinkleplop, runs in separate processes differed by 5 to 11%
from thermal and CPU speed effects alone.

**Paired rounds.** Each round times A B B A (or B A A B) and sums the time for
each arm. Each sample combines one A first round with one B first round, so
both arms are measured in both positions, and an odd round count is rounded up
(15 becomes 16). The reported figure is the median of the per sample ratios,
with a bootstrap 95% CI. Alternating the order across an odd number of rounds
once produced a 2% bias.

**GC and rewarm in every round.** Each round starts with a forced full `gc()`,
followed by 20 ms of untimed rewarm for both arms and then a minor gc, before
the timed windows begin. A natural full GC inside a timed window once put an
A/A row 102% off. The forced GC drops optimised code that feedback vectors
hold only weakly. Without the rewarm, the numbers measured V8 reoptimising the
code rather than the code itself. The minor GC empties the nursery that the
rewarm filled, and it leaves optimised code alone.

**Iterations are calibrated after warmup.** Each arm warms for 120 ms and then
rewarms just before its iteration count is sized. Sizing an arm right after
the other arm's warmup gave windows 7x shorter than the target. Both arms use
the same iteration count, taken from the slower arm. Each window gets at least
4 calls, so that one GC pause cannot make up half a measurement. The exception
is a call over 50 ms, which already dwarfs any pause. The quadratic workloads
(see below) would otherwise take minutes each.

**Independent passes.** `--repeat 2` runs the whole suite twice. A row counts
only if both passes agree in direction, and the smaller speedup is the one
reported. Consecutive rounds are correlated by slow machine drift, but two
passes separated by the whole suite are not.

**Anchor drift.** A fixed workload is measured at the start and end of every
run. It is defined inside the harness, so no change under test can alter it,
and its shape follows the parser's hot loop. Drift above 3% means the machine
changed speed during the run. The paired ratios still hold in that case, but
the absolute timings in the report do not.

**Machine lock.** The lock at `/tmp/mdsvex-perf.lock` covers the whole run of
`ab.mjs`, `calibrate.mjs`, `parity.mjs` and `profile.mjs`. Other runs block
until it is free rather than running alongside. Two concurrent benchmarks
distort each other, and not symmetrically between the arms. The lock
deliberately installs no signal handlers. Measurement is one long synchronous
loop, so a handler would never run and Ctrl-C would be ignored until the run
ended. A killed run instead leaves a dead PID, which the next waiter breaks.
Nothing else CPU heavy should run during calibration or an A/B.

**Noise floor.** `calibrate.mjs` runs exactly the `ab.mjs` protocol with the
reference as arm A and the mirror as arm B. These are two independent builds
of one commit, so the true ratio is 1.00 on every row. The floor is the p99 of
|deviation| across rows, rounded up to 0.1%. `ab.mjs` reads it from
`calibration.json` unless `--noise-floor` overrides it.

## What counts as a result

A row has moved only if **all** of the following hold:

1. the effect exceeds the calibrated noise floor,
2. the 95% CI excludes 1.0,
3. with `--repeat 2`, both passes agree in direction,
4. the paired median and the best-of ratio agree. Otherwise the row is
   reported as `unstable`.

The CI alone is not enough. In the A/A calibration below, the CI excluded 1.0
on 45 of 233 unchanged rows.

Use `quick` while exploring. Run `core --repeat 2` for anything you intend to
claim, and run `full` before proposing a merge.

### Group thresholds

A geomean over a group averages the noise away, so it can resolve effects
much smaller than the per-row floor. `group-floor.mjs` resamples the A/A
calibration into the null distribution of |geomean - 1| for each group size.
It takes no new measurements and no lock.

```bash
node packages/bench/perf/bin/group-floor.mjs
```

`ab.mjs` prints the p99 threshold next to every group geomean and marks the
groups that are past it. A group geomean past its p99 counts as a real effect,
even when no single row clears the per-row floor, **but only if the group was
chosen before looking at the results.** Selecting a group after seeing which
rows improved does not count.

From the calibration below (core suite, 233 rows, 15 rounds):

| group size |   p50 |   p95 |   p99 |
| ---------: | ----: | ----: | ----: |
|         10 | 0.14% | 0.40% | 0.54% |
|         20 | 0.11% | 0.29% | 0.38% |
|         37 | 0.09% | 0.23% | 0.29% |
|         54 | 0.08% | 0.19% | 0.25% |
|        100 | 0.07% | 0.16% | 0.20% |
|        233 | 0.06% | 0.13% | 0.15% |

Resampling assumes the rows are interchangeable. The four `setup` rows are
not: `setup/parser` allocates a fresh `TreeBuilder` per call, and its CI
spans about plus or minus 9%. It dominates a four-row geomean, and in one A/A run it pushed
the `setup` group past its p99 (-1.95% against 0.92%) with no row past the
floor. Do not read a `setup` group verdict on its own.

## Calibration on the machine that built this

These numbers are from an Apple M1 Max (10 cores, 64GB) on Node 20.20.2, on a
laptop in normal desktop use rather than an idle machine. The load average
was around 3 to 5 from the browser, the Claude app and WindowServer.
`calibration.json` is not committed. The figures are here so that a later
calibration has something to compare against.

| A/A, core, 233 rows, 15 rounds        |    value |
| ------------------------------------- | -------: |
| per-row noise floor (p99, rounded up) |     2.7% |
| median \|deviation\|                  |    0.24% |
| p95                                   |    1.25% |
| worst                                 |    3.17% |
| geomean                               |   +0.06% |
| CI excluded 1.0                       | 45 / 233 |
| anchor drift                          |   +1.96% |

The first version of the harness bound every workload up front, always
building arm A's closures before arm B's, and kept all of them alive for the
whole run. It calibrated at a 5.7% floor (p95 4.05%, worst 13.3%), and in an
A/A through `ab.mjs` the `vite-transform` mode came out 1% slower on arm B,
past its group p99. Binding each workload just before it is measured,
dropping it afterwards and alternating which arm is constructed first halved
the floor.

Validation, all from a worktree at the reference commit, whose `dist` is
byte-identical to the reference builds:

- **A/A through `ab.mjs`** (`--suite core --repeat 2`): 0 rows past the
  floor, overall geomean -0.03%, and every document-mode geomean inside its
  p99. `setup` is the exception described above.
- **Planted slowdown**: a busy loop of 64 `Math.imul` steps per
  `TreeBuilder.close`. Every row in the modes that parse was detected:
  `parse` 55/55 (geomean -52%), `incremental-64` 29/29 (-42%),
  `compile-mapped` 29/29 (-32%) and `vite-transform` 27/29 (-20%; the two
  misses are documents dominated by the quadratic v3 map). Nothing moved in
  the modes that time pre-parsed input: `render` -0.10%, `render-mapped`
  -0.03% and `sourcemap-v3` -0.04%, all with 0 rows past the floor.
  `setup/parser`, which constructs the changed class, moved +4%.
- **Planted small slowdown**: the same loop with 2 steps. It did not produce
  the expected ~3% on parse. `parse` moved -0.35%, which is past its group
  p99 of 0.25% even though no row cleared the floor. `incremental-64` got
  _faster_, by +1.7%. Two extra instructions in `close` changed V8's
  optimisation of the parser, which is a real effect of the change and the
  reason a planted slowdown is not a clean ruler at this scale.
  `real/plugins-remark_plugins:incremental-64` swings about plus or minus 11% between
  builds for the same reason, so treat that row with suspicion.
- **Planted output changes**: a trailing space on link titles in
  `TreeBuilder.attr` gave 93 divergent checks, starting with the node's
  metadata in `parse`. `<hr />` changed to `<hr/>` in the renderer gave 86
  divergent checks in the render and compile modes and none in parse. Parity
  exited 1 both times and 0 after the revert.

## Suites

| suite   | workloads | for                                                                    |
| ------- | --------: | ---------------------------------------------------------------------- |
| `quick` |        57 | iterating. real with parse, render-mapped, vite-transform. about 2 min |
| `core`  |       233 | the default, and what calibration measures. about 9 min                |
| `full`  |       709 | every family and mode, before proposing a merge                        |
| `scale` |        25 | how cost grows with input length (sized and huge)                      |

`core` runs `micro` and `real` through one mode per distinct code path:
`parse`, `incremental-64`, `render`, `render-mapped`, `compile-mapped`,
`sourcemap-v3` and `vite-transform`. It adds `fixtures` with `parse` and the four
`setup` rows. The near-duplicate modes (`parse-direct`, `incremental-1024`,
unmapped `compile`, and the reused session) only run in `full`.

## Modes

| mode                    | what it runs                                                                   |
| ----------------------- | ------------------------------------------------------------------------------ |
| `parse`                 | `parse_markdown_svelte(src)`                                                   |
| `parse-direct`          | `new PFMParser(new TreeBuilder(...)).parse(src)`, what compile runs            |
| `incremental-64`/`1024` | `PFMParser` with `init`, `feed` in 64 or 1024 char chunks, then `finish`       |
| `render`                | `new CursorHTMLRenderer({ cache: false }).update(...)` on a pre-parsed tree    |
| `render-mapped`         | the same with `update_mapped`                                                  |
| `compile`               | `compile(src)`                                                                 |
| `compile-mapped`        | `compile(src, { sourcemap: true })`                                            |
| `compile-reused`        | `CompilerSession#compile(src)`                                                 |
| `compile-reused-mapped` | `CompilerSession#compile(src, { sourcemap: true })`                            |
| `sourcemap-v3`          | `mappings_to_v3(...)` on a precomputed mapped compile                          |
| `vite-transform`        | the `mdsvex()` plugin's pre transform: reused session compile plus v3 map      |
| `setup`                 | constructing a parser, a renderer, a `CompilerSession` or the plugin, no input |

Neither `sourcemap-v3` nor `vite-transform` is in the brief. They were added
because the profile shows that the v3 map is where the vite plugin spends its
time: 61 to 99% of the plugin transform on real documents. The plugin's post
transform needs a live Svelte compile, so it is not measured.

Parse-only modes use `@mdsvex/parse`'s `dist`, and the render modes use
`@mdsvex/render`'s `dist`. Compile modes use `mdsvex`'s `dist`, which bundles
its own copy of both.

## Corpus

The corpus is committed together with `corpus/manifest.json`, which records a
hash per file, the corpus hash, each file's sources, and everything that was
excluded and why. Every report records the corpus hash.

```bash
node packages/bench/perf/bin/build-corpus.mjs          # regenerate
node packages/bench/perf/bin/build-corpus.mjs --check  # exit 1 if stale
```

Regenerating invalidates every earlier report and calibration.

| family     | files | bytes | what it is                                                                                                     |
| ---------- | ----: | ----: | -------------------------------------------------------------------------------------------------------------- |
| `micro`    |    10 |   524 | tiny documents: a heading, an inline-rich paragraph, a component, a directive, empty. fixed per-call cost      |
| `fixtures` |    26 | 10.3K | the parser's own fixtures, concatenated per category. dense in grammar features                                |
| `real`     |    19 |  123K | the repo's own markdown, site pages and the benchmark `fixture*.md` files. use these for performance summaries |
| `sized`    |     3 |  108K | about 1KB, 10KB and 100KB, built by cycling whole real documents                                               |
| `huge`     |     1 |  3.8M | one multi-MB document for scaling and to catch quadratic behaviour                                             |

**Every input is valid PFM.** The parser never reports errors, so validity is
checked with a lint for CommonMark constructs that PFM removed or reads
differently:

- setext underlines
- indented code blocks
- lazy blockquote continuation
- trailing-space hard breaks
- shorthand and forward references
- unclosed fences

Inputs that trip the parser's infinite-loop guard are also rejected. A
document that fails is recorded under `excluded` in the manifest and is never
edited. Concatenated documents (fixtures, sized, huge) must render exactly as
the concatenation of their parts. Any piece that changes its neighbours, for
example a link definition another piece picks up, or frontmatter away from
the start, is excluded.

Excluded at the time of writing:

- `PLAN.md`: gitignored, so it cannot be reproduced from a commit.
- `packages/bench/README.md`: it trips the parser's loop guard (see below).
- The site's `_docs.svtext`: it uses forward references.
- 276 fixtures: 178 of them leak into neighbouring fixtures, and the rest use
  CommonMark-only syntax. Most of the latter are in the `setext_headings`,
  `block_quotes`, `html` and `generic_directives` categories.

## Parity

```bash
node packages/bench/perf/bin/parity.mjs [--baseline <root>] [--candidate <root>] [--families ..] [--modes ..]
```

This runs every corpus file through every mode on both arms and compares the
output exactly. The run takes about 25 seconds and makes 822 checks.

- **Parse:** a canonical line per node, covering kind, start, end, extra,
  value range, parent, sibling and child links, the pending word, metadata and
  pre-materialised strings. It also covers the raw metadata map, the node
  count, and the error collector's contents.
- **Incremental:** the same serialisation for each chunk size, plus a check
  against the batch parse. If the reference already has the same mismatch, it
  is reported as pre-existing instead of failing.
- **Render:** the HTML string byte for byte, and the full mapping list for
  `update_mapped`.
- **Compile:** `code`, plus the mappings when sourcemaps are on, plus the v3
  map and the vite transform output. The reused session compiles the whole
  corpus in order through one session per arm, so state that leaks between
  documents shows up.

The first difference in each failing check is printed along with the source
line it comes from. The script exits non-zero on any divergence.

## Profiling

```bash
node --expose-gc packages/bench/perf/bin/profile.mjs --family real [--arm <root>] [--plain]
```

This prints an absolute per-file breakdown for one arm:

- bytes, nodes and the total mapped compile time
- the share spent in parse, render and compile's own overhead
- MB/s, ns per byte and ns per node
- the vite plugin transform time and the v3 map's share of it

Absolute times drift with the machine, so use them to see where time goes.
Use `ab.mjs` to decide whether a change helped.

For a CPU profile, loop `compile()` over the corpus from `dist`. Save the
script outside the repo and run it from the repo root:

```js
// prof.mjs
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const { compile } = await import(
	pathToFileURL(`${root}/packages/mdsvex/dist/main.js`).href
);
const dir = `${root}/packages/bench/perf/corpus`;
const manifest = JSON.parse(readFileSync(`${dir}/manifest.json`, 'utf8'));
const docs = manifest.entries
	.filter((e) => e.family === 'real')
	.map((e) => readFileSync(`${dir}/${e.family}/${e.file}`, 'utf8'));

const deadline = Date.now() + 10_000;
let n = 0;
while (Date.now() < deadline) {
	for (const d of docs) compile(d, { sourcemap: true });
	n++;
}
console.log(`${n} passes`);
```

```bash
node --cpu-prof --cpu-prof-dir=/tmp/mdsvex-prof /path/to/prof.mjs
```

Open the `.cpuprofile` in Chrome DevTools (Performance, then load profile) or
in speedscope. The default build keeps class method names (`_finalize`,
`update_mapped`) but renames top-level functions to one or two letters, so
`compile`'s `render_once` shows up as something like `Bi`. To profile with
readable names, rebuild without minification. Rebuild normally afterwards,
because an A/B must measure the shipped build:

```bash
pnpm -C packages/parse build:tsc && pnpm -C packages/parse exec vite build --config vite.config.build.ts --minify false
pnpm -C packages/render exec vite build --config vite.config.build.ts --minify false
pnpm -C packages/mdsvex exec vite build --config vite.config.build.ts --minify false
```

## Findings from building the harness

These are pre-existing on `next` (b36f2e15). The harness surfaced them, and
none of them is fixed here.

- **`mappings_to_v3` is quadratic.** It takes 3.2 ms at 10KB, 1.3 s at 100KB
  and about half an hour at 3.8MB. `result[result.length - 1]` indexes a
  string that `+=` has turned into a rope, which flattens it on every segment.
  It accounts for 61 to 99% of the vite plugin's transform on real documents.
  `sourcemap-v3` and `vite-transform` are therefore not run on the huge
  document.
- **Incremental parsing with small chunks is superlinear.** `incremental-64`
  takes 26 ms at 100KB and 27.6 s at 3.8MB, where `parse` takes 0.2 s. After
  `this.source += chunk`, `charCodeAt` has to flatten the rope on every feed.
  `incremental-64` is therefore not run on the huge document either.
- **Parser loop guard.** `"1. ~1\n2. *"` trips "Infinite loop detected". The
  first place it appeared was the list in `packages/bench/README.md`.
- **Incremental differs from batch.** `fixtures/code_spans` fed in 64-char
  chunks gives 110 nodes, while the batch parse gives 115 (root child count
  109 vs 114). Parity reports this as pre-existing.
- **Leaf directive text is dropped.** `::note[text]` renders as an empty
  string when there is no handler. This may be intended, but the directive
  micro uses a container directive plus inline directives so that it
  exercises inline parsing.
