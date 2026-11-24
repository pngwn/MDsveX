# Streaming benchmark

Streams a markdown document into a page a chunk at a time, as a chat
interface does with a model's answer, and times each update from the call
into the library to the end of the frame that shows it. It runs in Chromium,
with each library's own way of putting a growing document on the page.

| name                 | library                    | what an update does                                                                                                                                                                                |
| -------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mdsvex-svelte`      | `@mdsvex/parse` + `render` | feeds the new text to the parser, `PluginStream`, `ComponentRenderer` and `Node.svelte`                                                                                                            |
| `mdsvex-html`        | `@mdsvex/parse` + `render` | feeds the new text to the parser and its `TreeBuilder`, shows the open line with `show_open_text`, `CursorHTMLRenderer`, parses the html of each block that changed and changes its nodes to match |
| `words-dom`          | `@pierre/words/html`       | `createDomRenderer().update()` with the whole text                                                                                                                                                 |
| `words-react`        | `@pierre/words/react`      | `<Markdown>` with the whole text                                                                                                                                                                   |
| `streamdown`         | `streamdown`               | `<Streamdown>` with the whole text                                                                                                                                                                 |
| `streaming-markdown` | `streaming-markdown`       | `parser_write()` with the new text, which appends to the DOM                                                                                                                                       |
| `react-markdown`     | `react-markdown`, gfm      | `<Markdown>` with the whole text                                                                                                                                                                   |
| `marked`             | `marked`                   | `root.innerHTML = marked.parse(text)`                                                                                                                                                              |

The adapters are in [`adapters`](./adapters). `mdsvex-html` is the only one
with code of its own to write the DOM, in
[`mdsvex-blocks.js`](./adapters/mdsvex-blocks.js). It keeps the nodes of each
block, and when the block's html changes it parses the new html and changes
the nodes on the page to match: children before the last are compared with
`isEqualNode`, the last is walked into, and a text node that grew gets
`appendData`. Two more run only when `--libs` names them:
`mdsvex-html-replace` replaces the nodes of a changed block instead, and
`mdsvex-html-wire` builds the tree through `WireEmitter` and
`WireTreeBuilder`, the way a server sends a document to a page. The census compares the page
with the renderer's html after every update of these two and reports any
difference as a failure.

## Running

Build parse and render first. The adapters import their `dist`.

```bash
pnpm -C packages/parse build && pnpm -C packages/render build
node packages/bench/streaming/run.mjs
```

| flag            | default  | what it does                                                     |
| --------------- | -------- | ---------------------------------------------------------------- |
| `--libs`        | all      | comma separated names from the table above, the first is `1.00x` |
| `--fixtures`    | ours     | comma separated, `chat`, `prose`, `code`, `tables`               |
| `--pierre`      | off      | adds the five documents of the words benchmark, see below        |
| `--chunk`       | `256,16` | UTF-16 units per update, one replay for each size                |
| `--runs`        | 5        | replays per library, each in a new page                          |
| `--throttle`    | 1        | CPU slowdown through CDP, 4 is close to a mid range phone        |
| `--interval`    | 0        | ms to wait after each frame, 0 sends an update every frame       |
| `--max-updates` | 1500     | skips a document and chunk size that need more updates than this |
| `--no-spin`     | off      | lets the CPU idle between frames, see below                      |
| `--headed`      | off      | shows the browser                                                |
| `--json`        | none     | also writes the report to this file                              |
| `--dump`        | none     | writes the final DOM of each library to this directory           |
| `--no-lock`     | off      | skips the machine bench lock                                     |

The run takes the machine bench lock in `/tmp/mdsvex-perf.lock`, the same
lock the perf harness uses.

## Where it comes from

`@pierre/words` publishes a browser benchmark of its React component against
Streamdown, in
[`packages/words/benchmark/browser`](https://github.com/pierrecomputer/pierre/tree/main/packages/words/benchmark).
It streams a document 256 characters at a time and times each update from the
React state change to the parent's layout effect. That is the time to write
the DOM. Its README says that it does not include paint, and it does not
include style or layout either.

This benchmark keeps what that one does well, and times further:

- the same chunking, 256 UTF-16 units with a surrogate pair kept whole, and
  with `--pierre` the same five documents. They are fetched from the commit
  in `fixtures.mjs` the first time and are not kept in this repository.
- `words-react` and `streamdown` are set up as the plain rows of that
  benchmark are, with no highlighting, controls, line numbers or fades.
- a warmup on a short other document before the replay, a new page for each
  replay, and a different library first in each round.
- a second chunk size of 16, which is closer to what a model sends in one
  frame. At 256 a document of 5,000 characters is 20 updates.

## What it measures

Each update runs at the start of an animation frame callback:

```js
requestAnimationFrame(() => {
	const t0 = performance.now();
	view.write(full, delta); // script
	const t1 = performance.now();
	root.offsetHeight; // layout
	const t2 = performance.now();
	channel.port1.onmessage = () => {
		const t3 = performance.now(); // paint
	};
	channel.port2.postMessage(0);
});
```

- **script** is the call into the library. Every adapter writes the DOM
  before it returns, the React ones through `flushSync`, the Svelte one too.
- **layout** is the style and layout of what the call wrote, forced by a read
  of `offsetHeight`. The frame would do the same work next.
- **paint** is the rest of the frame on the main thread, which is pre-paint,
  paint, layerize and commit. Chromium runs them in the task the animation
  frame callback runs in, so a task posted from the callback runs after them.
  Raster and the GPU are on other threads and are not in it.
- **to paint** is the three added up over every update and the final one,
  which tells the library the stream is over.
- **median**, **p95** and **max** are of one update, script to paint.
  **>16.7** counts the updates that took longer than a frame at 60Hz.
- **nodes made/kept** is from a replay that is not timed. A
  `MutationObserver` counts every node an update adds, and kept is the nodes
  in the final document. A library that makes many more nodes than it keeps
  writes the same content again and again.
- **shown** counts the updates after which the page shows more or less text
  than before. A library that holds text back paints less often, and its
  time to paint is not comparable with one that shows every chunk.
- **text** is the characters of the final text without whitespace. A `!`
  after it means the streamed document and the same document in one write
  differ.
- **heap** is the V8 heap after two collections, from the warmed page to the
  finished document. It does not include DOM nodes or Wasm memory.
- **gzip** is the adapter's production bundle, the files the page asked for,
  each at gzip level 9. It includes the framework the library needs.

A trace of a replay agrees with the timers. For 212 updates Chromium records
212 `Layout`, 213 `PrePaint` and 213 `Commit` events, and their durations add
up to within 15% of the layout and paint columns.

Rules that came from measuring mistakes:

- **The page keeps the CPU busy between frames.** A library that does little
  work leaves the main thread idle for most of each frame, and the CPU slows
  down. The same layout and paint then read up to twice as slow after a fast
  library as after a slow one. With the busy wait, libraries that write the
  same DOM in the same way get layout and paint times close to each other. `--no-spin` turns
  it off, which is what a real page does, and is the wrong way to compare.
- **The open line has to be shown.** A `TreeBuilder` fed by the parser shows
  a line once it ends. On `chat` at 16 characters that is 61 updates of 212
  that change the page, and less than half the time to paint. The other
  libraries show the line still open, so `mdsvex-html` calls
  `show_open_text` after each feed and `hide_open_text` before the next.
  `mdsvex-svelte` gets the same text from the wire, which `PluginStream` is
  built on.
- **Each update of the count replay is a task of its own.** React reads many
  `flushSync` updates in one task as a render loop and throws.
- **Compare within one run.** The same case read 47ms in one run and 103ms
  in another an hour later, for every library alike.
- **One copy of Svelte.** `Node.svelte` sits in `packages/render`, which
  resolves its own copy of svelte. Two runtimes in one bundle fail as soon as
  the view updates, so the build resolves every `svelte` import from here.
- **The pages are cross origin isolated**, as in the hydration benchmark, for
  5us timer steps. Most updates of the fast libraries take under 1ms.
- **Every library gets the same stylesheet** and none of its own. Streamdown
  expects Tailwind, and without it its wrappers have no style.

## What it does not measure

- The documents are not the same language to every library. PFM is not
  CommonMark: `**a**` is a `strong` in a `strong`, a line of a block quote
  needs its `>`, and raw HTML is read as Svelte. The text column shows where
  a library dropped or added text.
- `marked`, `react-markdown` and `streaming-markdown` do nothing about
  syntax that is still open. The others close it or hold it back while the
  stream runs, each in its own way.
- No library highlights code here.
- A replay starts on a page that has streamed one short document, so the
  first updates run code the JIT has not optimised yet. That is what the
  first answer in a chat sees. A long session would be faster for all of
  them.
- The page does not scroll, so most of a long document is below the fold and
  paints nothing.

## The dom prototype

`mdsvex-dom` runs only when `--libs` names it. It writes dom nodes from the
tree with no html string between: each node of the tree that shows has a
record of the node made for it, an update walks the children of the nodes
still open, and the text being written is appended to. A root block that
holds something it does not cover, an entity, a task item, an image, raw
html or a footnote, goes to `CursorHTMLRenderer` as in `mdsvex-html`, which
was 0 to 4 blocks of each document here. It leaves out the line feeds the
html has between the tags of lists, tables and block quotes.

The census checks its page against the html of `CursorHTMLRenderer` after
every update. It matched on 31 of 32 cases, the eight documents at 2, 5, 16
and 256 characters where the update cap allows. The other had a link inside
a link for four updates, which the html parser of the browser takes apart
and the tree does not.

Time to paint and script time in ms, median of 7 replays, on a machine
that was busy, so the ratios are worth more than the numbers:

| document, chars per update     |   dom |  html | words dom | streaming-markdown | script: dom |  html | words |
| ------------------------------ | ----: | ----: | --------: | -----------------: | ----------: | ----: | ----: |
| `chat`, 16                     |  69.5 |  82.5 |      82.1 |               69.7 |        16.2 |  28.4 |  26.5 |
| `chat`, 4                      | 174.1 | 168.4 |     186.8 |              265.4 |        35.5 |  55.1 |  56.4 |
| `prose`, 16                    | 198.8 | 221.5 |     233.0 |              178.6 |        38.3 |  62.5 |  59.8 |
| `code`, 16                     |  74.2 |  85.5 |      89.3 |               79.6 |        15.4 |  27.6 |  23.4 |
| `code`, 4                      | 280.6 | 327.4 |     318.7 |              434.7 |        49.9 |  94.1 |  71.0 |
| `tables`, 16                   |  82.0 | 105.7 |     107.8 |               80.8 |         8.8 |  31.3 |  33.9 |
| `tables`, 4                    | 225.5 | 327.1 |     349.7 |              278.1 |        19.5 | 101.0 | 119.4 |
| `pierre-assistant-review`, 16  |  82.9 |  87.5 |      91.7 |               71.9 |        23.3 |  28.8 |  30.0 |
| `pierre-assistant-review`, 4   | 251.1 | 325.4 |     311.2 |              306.5 |        64.5 | 110.6 | 102.2 |
| `pierre-assistant-explain`, 16 |  87.7 |  94.8 |      88.9 |               93.4 |        23.3 |  33.0 |  29.2 |
| `pierre-assistant-explain`, 4  | 238.2 | 284.0 |     305.0 |              400.6 |        50.1 |  94.2 |  96.3 |

It takes 1% to 36% less time to paint than `words-dom` on every case, with
20% to 84% less script, and less time than `mdsvex-html` on ten cases of
eleven. Against `streaming-markdown` it is from 41% faster to 15% slower,
level at 16 characters and ahead at 4.

It makes each node once where nothing is revoked: 169 made for 169 kept on
`chat`, 884 for 884 on `tables`, against 286 for 281 and 1,435 for 1,425 in
`words-dom`. On `pierre-assistant-review` it makes 397 for 332, the rest
being the blocks the html renderer writes and marks the parser opened and
then took back.

The node counts in the results below were taken before the census counted
each node once for an update. A library that puts a parent on the page and
then fills it read high there, `streaming-markdown` 840 for 649 on
`pierre-assistant-review` where it makes 649.

## Results

Measured on 2026-11-24 with Chromium 136.0.7103.25 on an Apple M1 Max, on a
120Hz display, with `node streaming/run.mjs --pierre` and `mdsvex-html-wire` and `mdsvex-html-replace`
added to `--libs`. Each number is the
median of 5 replays. `@pierre/words` 0.3.0, `streamdown` 2.8.0,
`streaming-markdown` 0.2.15, `react-markdown` 10.1.0, `marked` 17, React 19
and Svelte 5.55.

Time to paint in ms, 16 characters per update. The number after each document is its updates. Lower is better, and the lowest is bold.

| library                               | `chat` 212 | `prose` 839 | `code` 442 | `tables` 334 | `pierre-tiny` 85 | `pierre-assistant-review` 346 | `pierre-assistant-explain` 381 |
| ------------------------------------- | ---------: | ----------: | ---------: | -----------: | ---------------: | ----------------------------: | -----------------------------: |
| mdsvex, Svelte Node view              |      120.8 |       600.2 |      258.8 |        520.1 |             73.7 |                         275.9 |                          291.9 |
| mdsvex, html per block, patched       |       73.4 |   **323.1** |      177.5 |        220.3 |             47.4 |                         149.2 |                          184.1 |
| mdsvex, html per block, over the wire |       76.4 |       352.1 |      152.0 |        209.2 |             55.1 |                         201.1 |                          151.7 |
| mdsvex, html per block, replaced      |       72.7 |       338.8 |      175.5 |        277.8 |             55.3 |                         203.8 |                          150.7 |
| @pierre/words, dom renderer           |       66.4 |       342.1 |      161.6 |        214.1 |             57.2 |                         203.8 |                          144.0 |
| @pierre/words/react                   |       86.7 |       394.2 |      169.4 |        243.1 |             59.2 |                         242.4 |                          140.1 |
| streamdown                            |      187.8 |       849.4 |      529.8 |        646.5 |            213.8 |                        1044.0 |                          397.1 |
| streaming-markdown                    |   **52.2** |       336.5 |  **135.8** |    **176.1** |         **35.8** |                     **130.2** |                      **107.5** |
| react-markdown + gfm                  |      339.1 |      3592.6 |      734.0 |       1364.9 |            157.3 |                         767.9 |                          619.4 |
| marked + innerHTML                    |      210.2 |      2655.7 |      467.5 |        857.6 |            103.6 |                         592.4 |                          603.4 |

Time to paint in ms, 256 characters per update. The number after each document is its updates. Lower is better, and the lowest is bold.

| library                               | `chat` 14 | `prose` 53 | `code` 28 | `tables` 21 | `pierre-tiny` 6 | `pierre-assistant-review` 22 | `pierre-assistant-explain` 24 | `pierre-simd` 156 | `pierre-gfm-spec` 844 |
| ------------------------------------- | --------: | ---------: | --------: | ----------: | --------------: | ---------------------------: | ----------------------------: | ----------------: | --------------------: |
| mdsvex, Svelte Node view              |      22.6 |       84.7 |      27.5 |        63.0 |            15.3 |                         39.5 |                          32.0 |             311.3 |                3476.2 |
| mdsvex, html per block, patched       |      14.4 |       55.4 |      17.1 |        25.5 |            20.1 |                         32.4 |                          23.2 |             157.0 |                1079.1 |
| mdsvex, html per block, over the wire |      14.4 |       55.0 |      21.4 |        27.0 |            18.9 |                         34.8 |                          21.4 |             162.9 |                1120.8 |
| mdsvex, html per block, replaced      |      14.3 |       51.8 |      23.1 |        30.2 |            19.3 |                         32.6 |                          22.6 |             151.0 |                 994.1 |
| @pierre/words, dom renderer           |      15.9 |       52.4 |      20.4 |        25.0 |            21.9 |                         33.5 |                          28.2 |             151.2 |                1210.9 |
| @pierre/words/react                   |      16.5 |       56.6 |      24.0 |        30.7 |            21.8 |                         35.4 |                          28.7 |             167.2 |                1229.1 |
| streamdown                            |      43.1 |      139.0 |      65.4 |        85.1 |            52.6 |                        135.2 |                          73.3 |             423.5 |                7472.3 |
| streaming-markdown                    |  **11.9** |   **43.6** |  **16.6** |    **23.6** |         **9.4** |                     **20.8** |                      **21.3** |         **128.8** |             **974.3** |
| react-markdown + gfm                  |      54.2 |      308.7 |      79.3 |       133.7 |            43.6 |                        103.9 |                          85.2 |            2151.1 |               49331.6 |
| marked + innerHTML                    |      25.4 |      215.2 |      42.0 |        68.8 |            27.6 |                         65.2 |                          59.9 |            1159.1 |               21044.4 |

Where the time goes, `pierre-assistant-review` at 16 characters per update, 346 updates:

| library                               | script | layout | paint | p95 of an update | shown | nodes made/kept | heap MB | gzip kB |
| ------------------------------------- | -----: | -----: | ----: | ---------------: | ----: | --------------: | ------: | ------: |
| mdsvex, Svelte Node view              |  128.6 |   71.5 |  75.8 |             1.49 |   324 |      27633/1398 |    1.80 |    93.3 |
| mdsvex, html per block, patched       |   51.3 |   35.2 |  62.7 |             0.69 |   324 |         422/383 |    0.42 |    82.6 |
| mdsvex, html per block, over the wire |   72.2 |   45.5 |  83.3 |             0.83 |   324 |         422/383 |    0.46 |    82.6 |
| mdsvex, html per block, replaced      |   46.2 |   78.4 |  79.1 |             0.90 |   324 |        6567/383 |    0.40 |    82.6 |
| @pierre/words, dom renderer           |   67.5 |   48.2 |  88.8 |             0.83 |   343 |         435/426 |    0.21 |    86.0 |
| @pierre/words/react                   |  101.1 |   48.3 |  92.4 |             0.93 |   343 |         436/427 |    0.37 |   155.7 |
| streamdown                            |  894.6 |   58.2 |  91.0 |             5.28 |   343 |         467/413 |    2.58 |   232.1 |
| streaming-markdown                    |    6.8 |   48.2 |  75.1 |             0.60 |   337 |         840/649 |    0.07 |     3.3 |
| react-markdown + gfm                  |  649.7 |   48.0 |  70.3 |             3.96 |   343 |         415/382 |    0.86 |   115.3 |
| marked + innerHTML                    |  158.8 |  301.9 | 132.0 |             3.03 |   343 |       61429/393 |    0.73 |    12.4 |

Where the time goes, `tables` at 16 characters per update, 334 updates:

| library                               | script | layout | paint | p95 of an update | shown | nodes made/kept | heap MB | gzip kB |
| ------------------------------------- | -----: | -----: | ----: | ---------------: | ----: | --------------: | ------: | ------: |
| mdsvex, Svelte Node view              |  261.0 |  132.1 | 126.0 |             2.86 |   287 |     138514/3971 |    2.87 |    93.3 |
| mdsvex, html per block, patched       |   60.0 |   55.0 | 104.6 |             0.99 |   287 |       1415/1415 |    0.31 |    82.6 |
| mdsvex, html per block, over the wire |   62.3 |   50.9 |  95.9 |             1.00 |   287 |       1415/1415 |    0.38 |    82.6 |
| mdsvex, html per block, replaced      |   48.6 |  121.7 | 107.7 |             1.51 |   287 |      50475/1415 |    0.26 |    82.6 |
| @pierre/words, dom renderer           |   62.4 |   49.5 | 102.2 |             0.93 |   334 |       1435/1425 |    0.16 |    86.0 |
| @pierre/words/react                   |   88.5 |   49.7 | 104.9 |             1.00 |   334 |       1436/1426 |    0.33 |   155.7 |
| streamdown                            |  480.8 |   54.6 | 111.1 |             3.25 |   334 |         909/899 |    1.83 |   232.1 |
| streaming-markdown                    |    8.7 |   63.3 | 104.1 |             0.77 |   311 |       1856/1162 |    0.10 |     3.3 |
| react-markdown + gfm                  | 1205.2 |   53.4 | 107.4 |             7.81 |   334 |         897/887 |    0.76 |   115.3 |
| marked + innerHTML                    |  183.0 |  461.4 | 210.5 |             4.33 |   334 |     234732/1415 |    0.07 |    12.4 |

What the numbers say:

- `streaming-markdown` is the fastest on all but one case. It only appends,
  and its script time is a tenth of anyone else's.
- `mdsvex-html` and `words-dom` are level. The machine was busy during this
  run and the same DOM read up to 30% apart in layout and paint from one
  library to the next, so mdsvex reads from 27% faster to 28% slower at 16
  characters per update and from 18% faster to 6% slower at 256. A run of
  11 replays of these two alone, on six documents at 16 and 4 characters,
  put mdsvex from 27% faster to 14% slower, faster on ten cases of twelve.
- Keeping the nodes of the open block is what makes them level at 16
  characters. `mdsvex-html-replace` replaces the nodes of a block that
  changed, 6,567 nodes made for 383 kept where patching makes 422, and its
  layout takes twice as long, 121.7 ms against 55.0 ms on `tables`, a table
  being one block. The matching costs script time, 60.0 ms against 48.6 ms.
- The wire costs little in a page. `mdsvex-html-wire` builds the same tree
  through `WireEmitter` and `WireTreeBuilder`. In the run of 11 replays it
  took from 5% less to 18% more time to paint than the direct path, 2% more
  at the median, and 2% to 18% more script on ten cases of twelve. Hot in
  node the direct path builds the tree 5 to 10 times faster and reaches
  html 25% to 30% sooner, but a replay in a fresh page runs mostly cold
  code, and turning html into nodes costs more than making it.
- `mdsvex-svelte` takes 1.2 to 3.2 times as long as `mdsvex-html` on every
  case but the smallest. It replaces the nodes of each block that changed,
  and it keeps about four nodes for each one the html has, the comments
  Svelte marks its blocks with.
- Only `streamdown`, `react-markdown` and `marked` have an update that takes
  longer than a 60Hz frame, the last two on most updates of the largest
  document.
