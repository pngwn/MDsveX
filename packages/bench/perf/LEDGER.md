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
- **Triage, 2026-10-13 on 9d4c1a41:** with the check stubbed to `true`,
  `_cheatsheet:parse` reads +6.3% in both passes against a calibrated 4.6%
  floor, 300 lines of one element +6.7%, and the 56 parse rows of `core`
  -0.12%. So it still costs that one document and nothing else. Tried and
  dropped: a hand scan of plain text up to a bare close tag in front of the
  regex read -2.0% on the cheatsheet, a regex call is as fast as a char loop
  at these lengths. The memo is still not built.

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
- **Triage, 2026-10-13 on 9d4c1a41:** `bq_soft_break` is gone, every state
  asks `para_line`. 300 quoted paragraphs with link and image text over a
  line read -5.4% against the commit before #970 and -2.1% against f20a7cae,
  the same with emphasis -2.4% and +3.1%, plain quoted lines -0.5% and
  +16.6%. One workload per fresh process, four processes a row. Nothing in
  the corpus has the shape.

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
- **Triage, 2026-10-13 on 9d4c1a41:** a parse of the 20 real documents with
  the plugin over the same parse with none, paired in one arm: an attr on
  each heading +8.2%, attrs on emphasis, strong and links +16.2%, sectionize
  +23.2%, autolink +30.2%, the steps bundle +45.4%. A reused compile with
  autolink and sectionize +42.1%. A profile of the autolink parse has no one
  place: the handler's own slug and its two regexes are about 7 points of the
  30, node views and attrs 4, the builder's slow open and close paths 4.

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
- **Triage, 2026-10-13:** steps 1 to 4 against f20a7cae read `parse` +1.12%
  in both passes, six rows faster past a calibrated 4.6% floor and none
  slower, `micro/heading:parse` -3.1% under it. Left as it is: an arm in
  front of the call would put a block rule in two places for 8ns a heading.

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
- **Triage, 2026-10-13:** steps 5 to 7 against steps 1 to 4 read `parse`
  -2.74% in both passes against a calibrated 4.6% floor. Step by step on
  documents of 300 list lines it is all step 7: tight, loose and nested
  lists each -15% to -17%. No one function holds it. A sibling line made
  about 18 char reads outside a loop where the old path made 14, at 2 to 3ns
  a read, took three more calls and one more trip through the main loop.
- **Taken back:** one workload a process, `parse` against f20a7cae, before
  and after the five changes below.

  | document                      | before |  after |
  | ----------------------------- | -----: | -----: |
  | 300 tight items               | -16.3% |  +6.9% |
  | 300 ordered items             | -13.1% | +13.6% |
  | 300 loose items               | -15.1% |  +0.8% |
  | nested items                  | -17.9% |  -4.7% |
  | items over two lines          |  -5.1% | +16.2% |
  | plain quoted paragraphs       | +17.6% | +28.0% |
  | a list in a quote             |  +4.8% | +18.6% |
  | `micro/list`                  | -13.4% |  -0.6% |
  | `real/plugins-remark_plugins` |  -8.9% |  +3.5% |
  | `fixtures/block_quotes`       |  -1.9% |  +1.5% |
  | `fixtures/lists`              | -15.7% |  -9.8% |
  | `fixtures/list_items`         |  -8.0% |  -6.7% |
  | `fixtures/thematic_breaks`    |  -5.7% |  -2.8% |
  | `fixtures/tabs`               | -11.0% | -11.4% |
  - The item linefeed takes the next sibling in a loop where a whole parse
    went back through the main loop: 300 tight items +8.1%.
  - A marker in its plainest form at the margin (`- a`, `1. a`) is answered
    in one test in front of `line_start` and the probe, behind the fast path
    switch: tight +19.2%, ordered +22.9%, `micro/list` +9.4%, and `parse`
    over the suite +1.01% in both passes.
  - The paragraph of a loose item opens at its marker: loose +12.3%.
  - `para_text` carries on across quoted lines in a whole parse: plain quoted
    paragraphs +8.8%, a list in a quote +6.8%.
  - Fewer reads: the probe is told where its char is, the interrupt check and
    the thematic break test keep the char they read, the item linefeed takes
    a parsed marker for a line that is not blank, `line_start` and `item_lf`
    read the end of the input in bounds. Nested items +4.3%, `fixtures/lists`
    +4.1%.

- **Left:** documents of short lists of many shapes (`fixtures/lists`,
  `fixtures/list_items`, `fixtures/tabs`), nested items and thematic breaks.
  They take the general path, `para_line`, the probe and `line_start`, on
  nearly every line. Tried and dropped: the same marker test after a
  paragraph at the root and at a list start read level, and one marker
  object a parser in place of one a line read level on its own.

### tag paragraph marks and line start tag checks

- **Source:** the parser bug stack after the restructure (#1046, #1058,
  #1062, #1071 and #1076). Three places: `closes_on_line` and
  `inline_past_line` for a tag that starts a line, the `spec_watch` compare
  in the four emit functions, and the NUL compare at the top of the loop in
  `_run`.
- **Measured:** two `quick` passes of the top of the stack against 5087db10
  with the default 3.0% floor. `parse` -1.40% and -1.37%, `vite-transform`
  -1.68% and -0.91%, `render-mapped` -0.49% and +0.03%. One row is slower
  past the floor in both passes, `real/site-src-components-_cheatsheet:parse`
  at -4.2% and -4.0%. `core --modes incremental`, one pass: -0.65%, with
  `micro/directive:incremental-64` at -3.7%.
- **Cause:** not isolated in the harness. A timing loop over one frozen build
  per commit puts about 2% on the two documents that are mostly tags
  (`bench-benchmarks-fixture-html`, `_cheatsheet`) at the commits for #1058
  and #1062, where a tag at a line start is checked for content after it and
  the "closes on its line" scan learned code spans, autolinks and self
  closing tags. The same loop reads three prose documents as level at every
  commit, so the 1.4% over all twenty is spread thin. A first version of the
  NUL fix scanned the source for one before every parse and cost 7 to 8% on
  `parse`, which is why a NUL is now only looked at under the cursor.
- **Ideas:** `closes_on_line` looks for a backtick and tries an autolink at
  every `<` of the line, both could wait until the element's own name shows
  up again. Guess, not measured.
- **Triage, 2026-10-13:** the stack that brought these read `parse` -1.72%
  in both passes against the commit below it, with
  `fixtures/backslash_escapes` -9.2%, `fixtures/links` -7.1% and
  `fixtures/html` -6.0% past a 4.6% floor. By stub on 9d4c1a41: without the
  `spec_watch` compare `parse` +0.76%, without the NUL compare +0.89%,
  neither with a row past the floor, and without the backtick and autolink
  checks of `closes_on_line` -0.11%. The two link rows are the unescape of a
  destination and a title, which is work the documents ask for. Tried and
  dropped: the watch test moved out of the four emit functions onto the id
  table bound read `parse` +0.29% with the passes at -0.31% and +0.90%. The
  backtick search is closed below. The NUL compare was not tried.

### attrs on pending emphasis

- **Source:** #950 and #956.
- **Measured:** 0.8 to 1.7% slower parse in fresh-process tables, level in
  a compile.
- **Cause:** not found.
- **Ideas:** none yet.
- **Triage, 2026-10-13:** not looked at. The plugin row above has what attrs
  on emphasis, strong and links cost today, +16.2% over no plugin.

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
- **Triage, 2026-10-13 on 9d4c1a41:** with the test taken out, `render`
  reads +0.71% and `render-mapped` +0.68%, both passes, no row past the 4.6%
  floor. The trace shows `escape_text_at` inlined into the walks with the
  test in it, so the cost is the char load of each text node and not a lost
  inline. Not changed in this pass.

### a dollar in prose

- **Source:** inline math, the `$` entry in `TEXT_BREAK` and `math_scan`.
- **Measured:** `fixtures/textual_content:parse` -4.3% (490ns to 514ns, -5.5%
  and -4.3% by pass), `core --repeat 2` against the commit below with the
  default 3.0% floor. The fixture is 52 bytes and holds one dollar. Geomean
  over the 238 workloads +0.09%, parse +0.26%, no other row past the floor,
  parity all outputs identical.
- **Cause:** a text run stops at a dollar, the text state reads the character
  after it and starts the next run. About 24ns a dollar that opens no math. A
  document with no dollar pays nothing.
- **Ideas:**
  - Look back from the backtick in place of the break, which is free for a
    dollar in prose and has to deal with a text node that would be empty. The
    design note measured both (`design/syntax-highlighting.md`, 14.3). Not
    built.
- **Triage, 2026-10-13 on 9d4c1a41:** without the `$` entry
  `fixtures/textual_content:parse` reads +5.1% and the 56 parse rows +0.26%.
  A document of prose with three dollars in two lines reads -10.9% against
  the commit before inline math. Tried and dropped: the rule inside
  `text_run` (a dollar is a break only before a backtick) gave that document
  +6.5% and cost prose with no dollar -4.8% and a document of headings
  -7.1%, and the same rule around the loop cost prose -5.9%. `text_run` has
  to stay as small as it is, so the rule would have to go to its callers.

### the cheatsheet render row after footnotes

- **Source:** footnotes, the renderer's two new node kinds and its section
  after the root.
- **Measured:** `real/site-src-components-cheatsheet:render` -8.9% (820ns to
  905ns, -8.9% and -11.1% by pass), `core --repeat 2` against the commit
  below with the default 3.0% floor. Geomean over the 238 workloads -0.10%,
  render -0.43%, no other row slower, parity all outputs identical. The
  level above it, blocks in a definition, read +0.03% with no row past the
  floor.
- **Cause:** not found. The document is a `<style>`, a `<script>` and one
  `<div>`, and holds no footnote. Rendered alone in a fresh process, 200,000
  times a round, it reads 762ns to 786ns before and 770ns to 782ns after, so
  it is the state the workloads before it leave the JIT in, not work the
  document does.
- **Ideas:**
  - Run the row alone, one workload a process, before reading anything into
    it.

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

### tag paragraph open elements

- **Source:** #964, the scan of a paragraph that starts at a tag. Closed by
  #1100, which decides a tag paragraph from the nodes it opens and took the
  scan out.
- **Was:** -1.5% to -8.1% on documents made of one tag paragraph. On
  9d4c1a41 the two documents of the entry read +32.7% and +17.5% in `parse`
  against the commit before #964, and +25.6% and +15.9% fed.

### fed parsing with small chunks is superlinear

- **Source:** older than the harness. Closed by the feed window, which is
  trimmed as the parse moves and takes each chunk as a flat string.
- **Was:** `incremental-64` took 26ms at 100KB and 27.6s at 3.8MB. On
  9d4c1a41 a feed of 64 char chunks takes 1.2 to 1.5 times a whole parse at
  1KB, 10KB, 100KB and 3.8MB, 36ms for the last.

### backtick search from every tag line

- **Source:** the stack of #1058 and #1062, `closes_on_line`. Found by this
  pass, it was never an entry.
- **Was:** for a line that starts at a tag the scan looked for the next
  backtick with one search that ran to the end of the document when there was
  none, so a document of such lines took time by the square of its length.
  Lines of one element with no backtick: 0.87ms at 24KB, 74ms at 379KB, 1.1s
  at 1.5MB. The answer is now kept across lines, in a feed too: 0.65ms, 7.1ms
  and 31ms, and 300 such lines read +65.1% in `parse`. The corpus did not
  show it, a backtick is always near in it.

### text run call

- **Source:** step 9 of `design/parser-structure.md`, `text_run` and
  `text_run_after`.
- **Was:** `parse` -0.98% for the step in both passes, `atx_headings` -3.9%.
  The call also took the inline budget of its callers: `para_text` lost
  `emit_leaf` and the main loop lost `emit_close`. `text_run_after` is gone,
  it was `text_run` but for a NUL, which reads on as text either way. A
  document of headings and paragraphs reads +6.0%, `fixtures/atx_headings`
  +3.0%, prose +4.3%, one workload a process. Over the suite `parse` reads
  level, +1.11% and -1.10% by pass.

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
  `render` mode and read level. The check for text a plugin wrote took it to
  479 the same way, until it moved into `stored_text`. Check the length with
  `node --print-bytecode --print-bytecode-filter=<name>` when the function
  changes, and move new work behind a call.
- **A candidate reads slow in a parse only run.** Seven `core --modes parse`
  runs, each phase of the restructure against the one before, multiply to
  -5.4% where the direct comparison reads -2.6%, about 0.4% a run. Compare
  the two ends directly and read a chain for which step moved, not for a sum.
- **`fixtures/paragraphs` and `fixtures/soft_line_breaks` have two speeds.**
  One build read 1,618ns as the candidate of one run and 1,516ns as the
  baseline of the next, both passes agreeing each time. It is which callees
  `para_text` gets inlined, do not read a cost off these two rows.
- **A char read outside a loop costs 2 to 3ns.** A scan loop pays the string
  shape checks once, a lone `char_code_at.call` pays them every time. The
  list line of the restructure made about 18 such reads where the old one
  made 14, and that was most of its 15%. Count reads before counting calls.
- **`text_run` has to stay small.** A rule added inside it or around its loop
  cost prose 5% and headings 7 to 10%, see a dollar in prose.
- **A document made of one construct.** The corpus hid a search that ran to
  the end of the document from every tag line, because a backtick is always
  near in it. 300 lines of one shape, timed one workload a process with
  `compare_one`, found it.
- **Fed modes.** `quick` has none. Use `--suite core --modes incremental`.
- **`real/bench-benchmarks-fixture-code:incremental-64` reads fast.** It read
  +5.5% and +4.8%, both passes, for two changes that do not reach fence code.
- **Tag paragraphs.** The corpus has almost none, so a change to their scan
  reads level in `quick`. Time a document made of them as well.
