# Performance ledger

A list of known costs that nobody has tuned yet, and where each one comes
from. It exists so that correctness work does not stop for one-off perf
fixes, and so that a later performance pass starts from a list instead of
from old PR descriptions.

Numbers follow the harness: a negative percentage is slower, a positive one is
faster.

## The rule while correctness work is going on

For a change that is not itself a performance change:

1. Run one `quick` A/B against a private baseline of the branch point. Add
   `--suite core --modes incremental` if the change touches fed parsing, since
   `quick` has no fed modes.
2. If a row moves past the noise floor, find the cause, add an entry below in
   the same PR and move on. Do not build variants and do not tune.
3. Stop and ask before merging only when the cost is structural:
   - the geomean of a mode moves by more than about 3%, or
   - the cost grows faster than the input, or
   - one construct moves the whole document onto a slower path (the id map and
     the undo logs in #950 were this kind).

A change that adds work for documents that use a new feature is not a drop.
Record it only when documents that do not use the feature pay too.

## Entry format

```md
### short name

- **Source:** the PR, and the function or check that costs.
- **Measured:** workload and mode, the number, the baseline commit, the noise
  floor it was read against.
- **Cause:** one or two sentences.
- **Ideas:** what could remove it, with any estimate. Say which were measured
  and which are guesses.
```

Move an entry to Closed, with the PR that fixed it, when it is gone. Do not
delete it.

## Open

### line start element close check

- **Source:** #961, `sure_to_close` in `open_spec_tag`.
- **Measured:** `real/site-src-components-_cheatsheet`, against b7330075 with
  the default 3.0% floor. `parse` -6.4% (26.5us to 28.2us), `vite-transform`
  -4.7%, fed parse -4.5%. Geomean over the 59 `quick` workloads -0.16%.
- **Cause:** a line that holds one element used to trust a plain text search
  for its close tag. It now checks the prediction with one sticky regex, 45 to
  65ns a line. 24 of that document's 117 lines are such a line. Stubbing the
  check to `true` returns the document to +0.3%.
- **Ideas:**
  - A memo of the next break character, so plain text content is free.
    Estimated to bring the document to about -4.5%, for roughly 30 lines plus
    feed invalidation. Not built.
  - Have `handle_repair` keep a revoked element's inline children in the
    paragraph it makes. The repair does this now. Whether the check can go is
    not tested, a fed parse still has to match a whole one.
  - Measured and rejected: a dry run with the real tag parsers (-19.5%) and a
    hand-written walk (-8.7%).

### open inline nodes at a quoted line end

- **Source:** #970, `bq_soft_break` in `packages/parse/src/main.ts`, which link
  text, the delimiter states and the inline element state call at a linefeed
  in a block quote.
- **Measured:** a synthetic document, nothing in the corpus has the shape:
  300 quoted paragraphs whose link and image text runs over a line, `parse`
  -3.2% to -5.0% over six runs in both arm orders. The same with emphasis
  reads -0.2% to -2.4%. Against the branch point, one workload per process with
  `compare_one`, where a document of plain quoted lines read -0.7% to +1.3%.
  `quick` reads -0.04% with no row past the default 3.0% floor.
- **Cause:** not isolated with a stub. A linefeed inside link text or a
  delimiter in a quote now asks the paragraph's whole question
  (`bq_line_ends_para`), two more tests than before. Link text also pushed
  `inline` twice at a continuation line, so the rest of the line after the
  link stayed in the second one. It now goes back through the paragraph
  state. The emphasis rows only gained the tests and move less, so the
  return to the paragraph state is probably the larger part for links.
- **Ideas:** guesses, none built. When the first character after the markers
  is a letter no line can end the paragraph, so `bq_line_ends_para` could
  return before its tests. The paragraph state would gain from that too.

### tag paragraph open elements

- **Source:** #964, the scan of a paragraph that starts at a tag
  (`spec_tag`), and `is_block_html_tag`.
- **Measured:** against 5db2f9d3 with the default 3.0% floor. No corpus row
  is slower past the floor: `quick` geomean +0.03%, fed parse of the real
  documents +0.50%. The corpus has almost no such paragraphs, so the numbers
  are from one line repeated 300 times, one workload per fresh process, both
  arm orders. `<Badge /> <b>new</b> in <i>this</i> release <Chart a={b} />`
  reads -1.5% to -2.2% in `parse` and -0.1% to -0.8% in `incremental-64`.
  `<Chart /><b><i><span>x</b> <em>y</em> z` reads -7.0% to -8.1% in both
  modes, and -4.6% to -4.9% in `parse` with `<s>` in place of `<em>`.
- **Cause:** the scan keeps the names of the open elements where it kept a
  count, one store for an open tag and one string compare for a close tag.
  After a close tag that closes several elements its depth is now 0, where
  the count read 2, so the next open tag is asked whether it is block level.
  That question is a string `switch` of about 60 cases on a name sliced from
  the source. The split between the two is read off the rows above, it was
  not isolated with a stub.
- **Ideas:** test the first character before the `switch`, a name that
  starts with an upper case letter is never block level. Guess, not
  measured. Measured and fixed in the PR: cutting the name array back with
  `length = n` made the next open tag allocate, 6 to 8% on the first line
  above.

### parse plugins: what a document still pays

- **Source:** #950 and #956, `PluginDispatcher` and `TreeBuilder`.
- **Measured:** reused session compile of the 20 real documents (122KB),
  cost over the same compile with no plugins, after #950: an attr on each
  heading 10%, attrs on emphasis and strong 20%, sectionize 24%, autolink
  32%, the steps bundle 52%. #956 then cut the parse by 13.7% for sectionize,
  9.7% for steps and 7.3% for autolink with sections.
- **Cause:** three things are left.
  - A live close callback still sends every close through the dispatcher.
  - The direct children of a wrapped parent still take the lookup.
  - The handlers' own work: views, attr proxies and undo entries, about 1us a
    heading for sectionize or steps.
- **Ideas:** bound the close path by the highest node with a callback, as
  #956 did for opens. Guess, not measured.

### autolink mask rewrite

- **Source:** #956.
- **Measured:** about 30ns per heading for a plugin whose wrapper only lasts
  as long as the heading, up to 4% on a tiny document made of headings.
- **Cause:** one rewrite of the open mask per heading, with nothing gained
  back because the wrapper closes with the heading.
- **Ideas:** none yet.

### block start call at the root

- **Source:** the shared block dispatch (steps 1 to 4 of
  `design/parser-structure.md`), the call to `block_start` from the root case
  of `_run`.
- **Measured:** `core --repeat 2` against edeaa909 with the default 3.0%
  floor. Geomean over 238 workloads +0.24%, `parse` +0.84%, every other mode
  within 0.3%. Five rows are faster past the floor (the paragraph, soft break,
  blank line, import and frontmatter fixtures, +3.6% to +9.0%) and none is
  slower past it. Slower in both passes and under the floor:
  `micro/heading:parse` -3.1%, `fixtures/html:parse` -2.7%,
  `micro/heading:incremental-64` -2.2%, `fixtures/links:parse` -1.9%,
  `micro/list:parse` -1.5%.
- **Cause:** a line that starts a block at the root used to dispatch inside
  `_run` and now pays one call. `_run` is 13% smaller in bytecode (36,231 to
  31,393), which is where the prose rows gain. Not isolated with a stub.
- **Ideas:** keep the two most common arms, the heading and the list marker,
  in front of the call in the root. Guess, not measured.

### list and quote lines read through line start

- **Source:** the container stack (steps 5 to 7 of
  `design/parser-structure.md`): `line_start`, `para_line` and `item_lf` in
  `packages/parse/src/main.ts`.
- **Measured:** `core --repeat 2` against edeaa909 with the default 3.0%
  floor, steps 1 to 7 together. Geomean over 238 workloads -0.61%, `parse`
  -0.66%, `incremental-64` -1.40%, `vite-transform` -1.14%, `compile-mapped`
  -0.97%, the render modes level. 21 rows are slower past the floor and 7
  faster. The slower rows are documents made of list lines:
  `fixtures/lists:parse` -12.2%, `micro/list:parse` -8.9%,
  `fixtures/tabs:parse` -7.4%, `real/plugins-remark_plugins:parse` -6.3%,
  `fixtures/list_items:parse` -5.9%, `real/readme:parse` -4.6%,
  `real/bench-readme:parse` -4.4%, `fixtures/block_quotes:parse` -3.8%. The
  prose fixtures keep the gain of the dispatcher (`paragraphs` +10.1%,
  `soft_line_breaks` +10.5%, `frontmatter` +13.8%). Step 5 on its own, against
  the step below, read -0.09% with one row past the floor,
  `fixtures/block_quotes:parse` -8.8%, before `line_start` kept its last
  answer.
- **Cause:** about 10ns a list line, not isolated with a stub. A line that
  ends an item's paragraph and opens the next item used to cost one probe and
  one marker parse. It now goes through `para_line`, `line_start`, the probe in
  `block_start` and `item_lf`, three more calls, none of them small enough to
  inline. The work is the same, the marker is still parsed once.
- **Ideas:** guesses, none measured.
  - Put `item_lf` back inside `_run_list_item`, one call less a line.
  - Have the probe take the first character's position, it scans the leading
    whitespace that `line_interrupts` just scanned.
  - A sibling marker at the margin is by far the common list line. `para_line`
    could ask the probe about the raw line before it calls `line_start`, and
    hand `item_lf` the answer with the marker.

### text run call

- **Source:** step 9 of `design/parser-structure.md`, `text_run` and
  `text_run_after` in `packages/parse/src/main.ts`, which seven scans of plain
  text now call.
- **Measured:** `core --repeat 2` against the step below with the default 3.0%
  floor. Geomean over 238 workloads +0.00%, `parse` -0.35%, every other mode
  within 0.3%. One row is slower past the floor, `fixtures/atx_headings:parse`
  -3.2%. Slower in both passes under the floor: `fixtures/inlines:parse` -2.0%,
  `micro/directive:parse` -2.0%, `fixtures/soft_line_breaks:parse` -1.9%.
  `_run` is 26,390 bytes of bytecode, from 29,425.
- **Cause:** a call where there was a loop in place. A heading takes it twice,
  once for its first run in `start_heading` and once a run in the main loop.
  Not isolated with a stub.
- **Ideas:** guess, not measured. `para_text` and the text state are the two
  hot callers, giving those two their loop back would cost about 20 lines and
  need an invariant against `text_run`.

### attrs on pending emphasis

- **Source:** #950 and #956.
- **Measured:** 0.8 to 1.7% slower parse in fresh-process tables, level in
  a compile.
- **Cause:** not found.
- **Ideas:** none yet.

### fed parsing with small chunks is superlinear

- **Source:** older than the harness, see Findings in the [README](README.md).
- **Measured:** `incremental-64` takes 26ms at 100KB and 27.6s at 3.8MB, where
  `parse` takes 0.2s.
- **Cause:** after `this.source += chunk`, `charCodeAt` flattens the rope on
  every feed.
- **Ideas:** none recorded.

### escaped brace check in text

- **Source:** #1033, the first character test in `escape_text_at` in
  `packages/render/src/html_cursor.ts`.
- **Measured:** `quick` with `--repeat 2`, the top of the stack #1029 to #1037
  against 3826a17a, default 3.0% floor, anchor drift +0.2%. No row is past
  the floor. By mode, pass 1 and pass 2: `parse` +0.04% and +0.15%,
  `render-mapped` -1.61% and -1.65%, `vite-transform` -0.81% and -1.42%.
  25 of the 39 render rows read slower in both passes, 2 of the 20 parse
  rows do. Worst in both passes: `real/bench-benchmarks-fixture-tables`
  `render-mapped` -4.3% and -2.5%, `real/migrate-readme` `render-mapped`
  -3.0% and -3.0%.
- **Cause:** not isolated with a stub. This is the only change to the
  renderer in the stack and the parse rows are level, so it is read off the
  modes. Every text node now loads its first character and compares it with
  the two braces, and the function calls itself for the rest of a node that
  starts at an escaped brace.
- **Ideas:** guesses, none built. Move the escaped case into a function of
  its own, so the hot one holds a load, two compares and no call to itself,
  which may be what keeps it from being inlined into the walks. Or have the
  parser mark the text node an escaped brace opens, so the renderer tests a
  bit it already reads.

## Closed

### id map and undo logs with parse plugins

- **Source:** found in #936, fixed in #950.
- **Was:** a node that a plugin added moved every later node onto the tree
  builder's id lookup, and a pending node that a plugin had changed kept its
  undo record until the document ended. Parse cost over no plugins was 59%
  to 102% and fell to 13% to 75%.

### open wrapper lookups

- **Source:** fixed in #956.
- **Was:** every node opened under a plugin wrapper went through the
  dispatcher. The dispatcher now keeps a floor above every link slot.

## Notes for the performance pass

These are not costs. They are things that have misled a measurement and will
again.

- **Noise floors.** A checkout with no calibration uses the default 3.0%.
  Calibrated on this machine while other sessions were building, the floor
  read 4.7%. Most rows recorded during correctness work were read against one
  of those two.
- **`real/bench-benchmarks-fixture-tables:parse` is noisy.** It read +4.7% in
  an A/A, and +9.0% in a single pass of a change that does not reach table
  code.
- **The empty document rows.** A/A reads them at plus or minus 4%. Confirm a
  flag on them with one workload per fresh process.
- **The compile entry sits at the inline budget.** `compile.ts` and the
  plugin's `compile_doc` are at TurboFan's 920 bytecode budget, so
  `micro/empty:vite-transform` and `micro/empty:compile-mapped` move 5 to 10%
  on structure alone. A new small helper on that path, a closure over the
  arguments of `compile_doc`, or one more pass over the text in `transform`
  each cost documents that never use the feature. Diagnose with
  `node --trace-turbo-inlining`, not by bisecting lines.
- **The renderer's text escape sits at the inline limit.** `escape_text_at` is
  446 bytecodes and V8 never inlines a function over 460. Three lines added to
  a branch of it that a plain render never takes made it 509, and with nothing
  else changed `render` read -1.5% and `micro/directive:render` -7.6% in both
  passes of `core --modes render,render-mapped --repeat 2`. `quick` has no
  `render` mode and read level. Check the length with
  `node --print-bytecode --print-bytecode-filter=<name>` when the function
  changes, and move new work behind a call.
- **Fed modes.** `quick` has none. Use `--suite core --modes incremental`.
- **`real/bench-benchmarks-fixture-code:incremental-64` reads fast.** It read
  +5.5% and +4.8%, both passes, for two changes that do not reach fence code.
- **Tag paragraphs.** The corpus has almost none, so a change to their scan
  reads level in `quick`. Time a document made of them as well.
