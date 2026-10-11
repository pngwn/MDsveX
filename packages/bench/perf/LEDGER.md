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

- **Source:** the line start element fix (branch `p/nostalgic-hugle-ee589c`,
  not merged when this was written), `sure_to_close` in `open_spec_tag`.
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
    paragraph it makes. Needs no check at all, but changes the repair for
    every consumer. Not built.
  - Measured and rejected: a dry run with the real tag parsers (-19.5%) and a
    hand-written walk (-8.7%).

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
- **Fed modes.** `quick` has none. Use `--suite core --modes incremental`.
