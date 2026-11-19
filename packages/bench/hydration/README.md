# Hydration benchmark

Times how long Svelte takes to hydrate an mdsvex page in headless Chromium,
for each compile arm, on three page styles:

| style           | page                                       |
| --------------- | ------------------------------------------ |
| `interleaved`   | 1 to 3 static blocks, then 1 dynamic block |
| `mostly_static` | 10 static blocks, then 1 dynamic block     |
| `static`        | static blocks only                         |

A static block is markdown with no Svelte in it, such as headings, paragraphs,
lists, quotes, code, tables and rules. A dynamic block is one of `<Counter />`,
a paragraph with `{expressions}`, an `{#if}` block or a `<button onclick>`. The
page is generated from a seed, so every arm and every run hydrates the same
markdown (`pages.mjs`).

## Running

Build parse, render and mdsvex first. The benchmark imports
`packages/mdsvex/dist`.

```bash
node packages/bench/hydration/run.mjs
```

| flag         | default | what it does                                              |
| ------------ | ------- | --------------------------------------------------------- |
| `--blocks`   | 300     | top level blocks per page                                 |
| `--cold`     | 30      | page loads per arm                                        |
| `--warm`     | 300     | hydrations per arm in the warm loop                       |
| `--throttle` | 1       | CPU slowdown through CDP, 4 is close to a mid range phone |
| `--styles`   | all     | comma separated styles                                    |
| `--seed`     | 1       | page generator seed                                       |
| `--json`     | none    | also writes the report to this file                       |
| `--no-lock`  | off     | skips the machine bench lock                              |

The run takes the machine bench lock in `/tmp/mdsvex-perf.lock`, the same lock
the perf harness uses. A second benchmark running at the same time distorts
both.

## What it measures

Each arm compiles the page with mdsvex (`ARMS` in `run.mjs`), then compiles it
again with Svelte for the server and the client (`runes: true`, production),
then bundles both with esbuild (`build.mjs`). The server bundle renders the
HTML, and the page serves that HTML with the client bundle. Playwright answers
every request through a route on `localhost`, so no server runs.

- **cold**: one page load per sample. The module script calls `hydrate` and
  `flushSync` as the page loads. This covers a cold JIT and a cold Svelte
  runtime, which is closest to what a visitor sees.
- **warm**: both arms' bundles are in one page. Each rep sets `innerHTML` to
  the server HTML, then hydrates and unmounts, and the arms alternate rep by
  rep.
- **parse+layout**: from the same warm loop. It is the time to set `innerHTML`
  and force style and layout. Wrapper elements show up here if they cost the
  browser anything.
- **top level**: the child nodes of the server HTML at the root. The hydration
  walk steps over these one by one to reach each node Svelte owns.

Each ratio is the median of paired per sample ratios, with a 95% bootstrap
interval. The times are the mean of the middle half of the samples.

Rules that came from measuring mistakes:

- The pages are cross origin isolated (COOP and COEP headers on a `localhost`
  origin, which is a secure context). Without that, Chromium rounds
  `performance.now()` to 100us, and warm hydrations of a 300 block page are
  around 100us.
- In an A/A run, the bundle a page imports second reads a few percent slow in
  the warm loop. The loop therefore runs once in each import order, so every
  arm fills both slots.
- The warm loop runs synchronously in the module script and holds up `load`,
  so the runner does not wait for `load`. At 4x throttle the loop takes longer
  than Playwright's 30s default.
- Any console message about hydration fails the run. After a mismatch Svelte
  throws the server DOM away and mounts, so the run would time a mount.

## Noise

Measured A/A, both arms the same build, 300 blocks, M1 Max, 2026-10-30:

| metric       | spread of A/A ratios      |
| ------------ | ------------------------- |
| cold         | +/-3 to 5%                |
| warm         | +/-4% at 1x, +/-10% at 4x |
| parse+layout | +/-1%                     |

## Results: `wrap_static`, 2026-10-30

`wrap_static: true` against plain, M1 Max, Chromium 136. Each cell is the
change in time against plain, as a paired median ratio. Runs whose 95%
interval crosses zero are marked "noise".

| page                    | top level nodes | cold   | warm         | parse+layout |
| ----------------------- | --------------- | ------ | ------------ | ------------ |
| interleaved, 300, 1x    | 377 -> 286      | -2.9%  | -3.2%        | +1.0%        |
| mostly static, 300, 1x  | 316 -> 78       | -3.4%  | -18.4%       | noise        |
| static, 300, 1x         | 294 -> 3        | -12.8% | -40.0%       | noise        |
| interleaved, 300, 4x    | 377 -> 286      | noise  | -3 to -8%(1) | +1 to +2%    |
| mostly static, 300, 4x  | 316 -> 78       | -6.1%  | -26.6%       | noise        |
| static, 300, 4x         | 294 -> 3        | -12.1% | -47.4%       | noise        |
| interleaved, 1000, 4x   | 1252 -> 937     | -2.3%  | -12.0%       | noise        |
| mostly static, 1000, 4x | 1050 -> 250     | -11.8% | -35.7%       | noise        |
| static, 1000, 4x        | 978 -> 3        | -26.9% | -74.9%       | noise        |

(1) The first pass read +9.6%, on a machine with a load average of 14. Two
quieter passes read -3.1% and -8.2%.

In absolute terms the saving is small. Hydrating the 300 block static page at
4x goes from 4.95ms to 4.43ms cold, while parsing and laying out the same page
takes about 57ms. The saving grows with the number of static siblings
hydration has to step over, so it matters most on long, mostly static pages.
The interleaved page gains little, because most of its static runs are one or
two blocks long and the wrapper replaces at most a couple of steps per run. The
extra wrapper elements cost about 1% of parse and layout on that page.
