# Parser structure: one grammar for every container

Status: draft, 2026-10-12. Targets `next` (f20a7cae). Nothing here is built except the test harness and a throwaway prototype that was measured and deleted. The decisions the maintainer has to make are in §10.

Sources:

- `packages/parse/src/main.ts` (13,155 lines, `PFMParser`, the state machine in `_run`).
- `packages/parse/test/invariance.spec.ts`, the harness this note is written from, and its census (§0).
- `PFM.md`, and the table of which block opens in which container from the third bug stack (issues #1019 to #1025).
- `packages/bench/perf` for the measurements in §7.

## Recommendation

- **Restructure, in small steps, starting with the block dispatcher.** The census says the parser's open failures are almost all one kind: a container state that lacks or differs from a check another container state has. Fixing them one cell at a time means about 25 more fixes spread over six hand written dispatchers, and the same again for each new construct.
- **Adopt one principle in `PFM.md`: every container holds the same block grammar, and a container defines only its line prefix and its end.** It decides seven open issues and most of the new ones without a ruling each (§6).
- **First, one block start dispatcher.** A prototype that routes the root, the svelte branch and the container directive through one function passes 6,025 of the 6,026 parser tests, makes `_run` 12% smaller in bytecode, and measures level: parse +0.5%, the 64 character feed -0.2%, nothing past the noise floor in the wrong direction (§7).
- **Then one line start routine** owned by a real container stack. This is the risky half, because the element, branch and directive states read whole lines today and have never seen a quote marker or a list indent (§1, §8).
- **Leave speculation and the header cell parser alone for now.** The harness found no failure in either (§3, §5).
- **Footnotes go in after the dispatcher is shared (step 4 of §8), inline math after the text scans are one (step 9).** Both can wait for the restructure without blocking on all of it.
- **Nine or ten PRs** after the harness, each one either behaviour preserving or fixing exactly the issues it names.

## 0. What the harness measured

The harness writes documents from the whole block and inline grammar, nested to three containers deep, and checks five things on each: the tree inside a container equals the tree at the root one level down, a whole parse equals a fed one (chunks of 1, 2 and 3, and a cut at every offset), the wire tree equals the batch tree, the stream contracts of `stream_shape.ts` hold, and no word of the source is lost and the loop guard never trips. It also checks that a header cell and a body cell with the same source have the same children.

One seed gives eight documents: a file at the root, the same file in each of the five containers, the file with one to four random edits (a deleted or inserted character, a cut, a dropped line), and one table cell.

Three census runs, 64,000 seeds and 512,000 documents in all. A count is a document that fails and stops failing when the one rule for that issue is applied. 19,571 more need two or more rules at once.

| issue       | what fails                                                               | documents        | where                        |
| ----------- | ------------------------------------------------------------------------ | ---------------- | ---------------------------- |
| #1047 (new) | a table in a list item loses its body rows                               | 27,996           | list item                    |
| #1021       | a svelte block does not open                                             | 18,230           | quote, list item, directive  |
| #1022       | a comment line gets a paragraph                                          | 11,073           | branch, directive, list item |
| #1020       | an html element does not open                                            | 8,015            | list item                    |
| #1019       | a table does not open                                                    | 7,730            | quote                        |
| #1048 (new) | the closing line of a svelte block or a directive is read as a table row | 6,935            | branch, directive            |
| #1050 (new) | an element holds its lines as inline content                             | 6,817            | quote                        |
| #1049 (new) | a line of only a tag keeps its paragraph                                 | 6,581            | directive, loose list item   |
| #1051 (new) | `- - a` is an empty item and a second item                               | 5,040            | list item                    |
| #1023       | a link reference definition is not read                                  | 3,563            | element                      |
| #1052 (new) | a comment before text is a block at the root and inline in a container   | 2,139            | root against the rest        |
| #1054 (new) | a comment over lines keeps the quote markers or the indent               | 1,446            | quote, list item             |
| #1025       | a directive left open in a list item runs past the item                  | 1,101            | list item                    |
| #1053 (new) | a directive or an element does not end a paragraph                       | 996              | quote                        |
| #1059 (new) | the line after a fence that ends a list item is text of the item         | 710              | list item                    |
| #1056 (new) | a thematic break ends the list or takes the next line                    | 559              | list item                    |
| #1002       | text after a block level element has no paragraph                        | 492              | root                         |
| #1058 (new) | an inline element that closes on a later line is a block at the root     | 325              | root against quote           |
| #1024       | an element in a directive in a quote keeps a paragraph                   | 324              | quote                        |
| #1062 (new) | an element that holds its own name again does not close on its line      | 35               | root                         |
| #1060 (new) | a directive, a list item or an element after a table is read as a row    | 11               | root, element                |
| #1057 (new) | a fence does not end the paragraph of a list item                        | 2                | quote                        |
| #1061 (new) | an open tag at the end of a table row takes the next line                | 1                | table                        |
| #1063 (new) | text after a closing fence on its line is lost                           | 1                | root                         |
| #1055 (new) | a fence in a list item keeps the indent in its code                      | every such fence | list item                    |

Twenty-five groups: eight issues that were open (#1002, #1019 to #1025) and seventeen filed from this census (#1047 to #1063). The counts say how often the generator writes the trigger, not how much a bug matters.

By invariant, over the 448,000 sources that get the file checks (64,000 of them edited):

| invariant                                   | groups                  |
| ------------------------------------------- | ----------------------- |
| container invariance                        | 20                      |
| a word of the source is lost                | 3 (#1047, #1061, #1063) |
| inline content right under a container      | 1 (#1002)               |
| whole equals fed, tree                      | 0                       |
| whole equals fed, text splits and positions | 0                       |
| wire equals batch                           | 0                       |
| stream contracts                            | 0                       |
| the loop guard trips                        | 0                       |
| header cell equals body cell                | 0                       |

#1055 is the twenty-fifth: it is a container difference in a value, which the harness expects until it is fixed.

What this says:

- **The duplication is in block dispatch and line prefixes.** Twenty of the twenty-five groups are a container that reads a line differently from the root, or the root differently from a container. Seventeen involve a list item or a block quote, the two containers that put something before each line.
- **Whole against fed, wire against batch and the stream contracts are clean** on this grammar, edited sources included. The fuzz work of the last three days finished that family. The harness keeps it finished.
- **The header cell and the body cell agree.** The one cell group is the root's handling of a comment, not a difference between the two cell parsers.
- **Some of these lose text or break the document,** which is worse than the gaps #1019 to #1025 suggested: a table body row in a list item is dropped, the line that closes a svelte block is eaten by a table, and a fence in a list item renders with the item's indent in its code.

### Is the list bounded

Yes, for the grammar the generator writes, with one caveat.

| run                 | seeds            | documents | groups no rule explained | of those, new causes |
| ------------------- | ---------------- | --------- | ------------------------ | -------------------- |
| building the table  | 0 to 3,000       | 24,000    |                          | 22                   |
| first wide run      | 0 to 16,000      | 128,000   | 23                       | 2 (#1060, #1062)     |
| second, fresh seeds | 16,000 to 40,000 | 192,000   | 6                        | 0                    |
| third, fresh seeds  | 40,000 to 64,000 | 192,000   | 1                        | 1 (#1063)            |

Eighteen of the twenty-five causes showed in the first 300 seeds and twenty-two by 3,000. The first wide run added two. Its other groups, and all six of the second run, were known issues meeting each other in ways the rules had not named, and the rules were widened. The third run found one new cause in 192,000 documents, in a source with random edits. So the structured grammar looks exhausted at this depth, and edited sources have a thin tail of about one new find per 200,000 documents.

That is a different shape from the last three days. The count did not grow as the search went on, and no fix was needed to see the next bug.

The caveat is masking. A known failure takes its construct out of the documents (every table inside a block quote, for #1019), so a second bug behind the same construct stays hidden until the first is fixed. Each fix removes its rule and reruns the census, and what shows then is counted then. The generator also writes well formed documents with a few edits, not character soup, so the per area fuzz specs keep their job.

## 1. One line start routine, owned by the container stack

### Today

There is no container stack. The open containers are five counters and a few scalars: `block_quote_depth`, `list_depth` with `list_content_offset` and `list_marker_indent`, `html_block_depth`, `svelte_block_depth` and `directive_colon_counts`. The paragraph state rebuilds the stack depth from them at every linefeed (`1 + block_quote_depth + list_depth * 2 + ...`). A counter cannot say in which order the containers nest, so `> - > a` (quote, item, quote) is read by stripping "two quote markers with any spaces between them", and the item's indent between the two markers passes as those spaces by accident.

Each state then strips what it knows about:

- **Quote markers:** `skip_bq_markers` at 15 call sites in 12 functions (`_run` three times, `_run_list_item` twice, `_run_block_quote`, `_run_directive_container`, `_run_code_fence_content`, `bq_line_start`, `bq_fence_scan`, `bq_soft_break`, `lf_continues`, `spec_scan_to`, `line_span_text`, `span_padded_end`), and written out again by hand in `can_decide_after_lf`, `is_block_quote_start` and the renderer's `strip_bq`.
- **Item indent:** `count_indent` and `skip_columns` in `lf_ends_inline`, the paragraph case of `_run`, `bq_list_marker` and twice in `_run_list_item`, plus `trim_before_indent` and the loop in `line_span_text`.
- **Nothing at all** in `_run_html_block_element`, `_run_svelte_branch` and the element half of `_run_directive_container`. They read whole lines. That is why an element in a block quote holds its lines as inline content (#1024 and the new #1050), why an element does not open in a list item (#1020), and why #1036 had to guard its fix with `block_quote_depth === 0`.

### Proposed

A stack of frames, one per open container, in nesting order. A frame is a kind, a node id and one number (the content column for a list item, the colon count for a directive, nothing for the others). The counters become reads of it.

One routine, `line_start(pos)`, called with the position after a linefeed. It walks the stack from the outside in and consumes each frame's prefix:

| container           | continues on a new line when                         | ends when                                                     |
| ------------------- | ---------------------------------------------------- | ------------------------------------------------------------- |
| block quote         | spaces, then `>`, then one optional space            | the line has no marker (no lazy continuation)                 |
| list item           | the line is blank, or indented to the content column | a line that is not indented and does not continue a paragraph |
| html element        | always                                               | its close tag                                                 |
| svelte branch       | always                                               | `{:x}` or `{/x}`                                              |
| container directive | always                                               | a closing fence of enough colons                              |

It returns two things: how many frames the line continues, and where the content starts. In a fed parse it also returns "not yet" when the line is too short to tell, which is the first half of what `can_decide_after_lf` does now.

Everything that crosses a line asks it, and nothing else looks at a marker or an indent:

- **The container states.** A state whose frame the line does not continue closes its node. The cascade that `_run_block_quote`, `_run_list_item` and `_run_directive_container` each write out goes.
- **The paragraph and the inline states that run over lines** (emphasis, strong, strikethrough, link text, an inline element, a code span). They get the content position and the count, and stop when the count is short. `bq_soft_break`, `lf_continues`, `link_text_lf_ends` and `_delimiter_lf_close` become one call.
- **Fences, comments and raw text** (`script`, `style`). They read their content lines from the content position. `bq_fence_scan`, `bq_fence_feed` and `bq_fence_may_decide` go.
- **Values.** A leaf that ran over lines inside a prefixed container stores its text as a string with the prefixes left out, the way `line_span_text` already does for a code span, and only when a frame with a prefix is open. The renderer's `strip_bq` goes, and so do #1054 (a comment keeps its quote markers) and #1055 (a fence in a list item keeps the indent in its code).

The root pays nothing: with no prefixed frame open the call site is one integer compare, as the `block_quote_depth > 0` tests are today.

## 2. One block start dispatcher

### Today

Each of the six container states writes its own `switch` on the first character of a line. They share the recognisers (`start_heading`, `start_fence`, `try_parse_list_marker`, `try_start_table`, `try_parse_block_directive`, `try_parse_html_open_tag`, `try_parse_link_ref_definition`) but not the code around them, and the lists differ:

- `_run_svelte_branch` has no comment arm, so a comment line gets a paragraph (#1022).
- `_run_directive_container` has no comment arm, no `{@tag}` arm and no `{#block}` arm (#1021, #1022, #1049).
- `_run_block_quote` has no `{#block}` arm (#1021). It has a table arm, but `try_start_table` looks for the delimiter row on the next line without the quote marker, so it never finds one (#1019).
- `_run_list_item` has no element arm (#1020) and reads `- - a` as two items (#1051).
- Only the root, the branch and the directive read a link reference definition (#1023 for the element).

Five more places ask "does the next line start a block" with a list of their own:

- `is_block_interrupt`: blank, `{:` `{/` `{#`, heading, `>`, a backtick fence, thematic break, list marker, a block level tag, `::`.
- `bq_line_ends_para`: blank, `>`, heading, thematic break, a backtick fence, a closing directive fence, list marker. No `::`, no tag, no `{#`, and the fence test runs before the item indent is skipped. So in a block quote a directive or an element does not end a paragraph (#1053), and a fence does not end the paragraph of a list item (#1057).
- `can_decide_after_lf`: a third list, of the first characters after which a fed parse may decide.
- The linefeed case of `_run_list_item`: thematic break first, then list marker, then indent. A thematic break at the content column ends the list (#1056).
- The `table_body` state: a blank line, a heading, a backtick fence, `>`, a thematic break and the close tag of an outer element end a table. A directive, a list item, an open tag, a closing directive fence and `{/x}` do not, and are read as rows (#1048, #1060). It also reads the row from the first character of the line, so in a list item the body rows are lost (#1047).

### Proposed

One function, which the prototype of §7 wrote:

```ts
/** 1 when a block opened, -1 while it is not all here, 0 when the line is a plain paragraph */
private block_start(code: number, current_node: number): number
```

It holds the union of the six switches. A container state keeps only what is its own: how it ends (close tag, `{:x}`, closing fence) and, until §1 is done, how it strips its prefix. After that it calls `block_start`, and opens a paragraph when the answer is 0.

A table per container kind says what is truly different, and it is short:

| container                            | differs how                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------- |
| root                                 | frontmatter on the first line, imports before any content                       |
| list item                            | a task marker on the marker line, and the rest of that line never opens a block |
| phrasing element (`<span>`, `<b>`)   | holds inline content only                                                       |
| raw text element (`script`, `style`) | holds text only                                                                 |

If the maintainer keeps link reference definitions root only (§10), that is one more row.

**The paragraph end comes from the same function.** `block_start` takes a third argument, `probe`. With it set, each arm returns at the point where it would have opened a node, having emitted nothing. "This line ends the paragraph" is then: `line_start` says the innermost frame does not continue, or the line is blank, or `block_start(probe)` returns 1 for a construct that may interrupt a paragraph, or the line is the end of the container. Which constructs may interrupt is one more column of data (a table, a link reference definition, a comment, a component and `7.` outside a list do not). The dispatcher and the predicate are the same arms, so they cannot disagree.

What becomes of the five:

- `is_block_interrupt` and `bq_line_ends_para` are deleted. Their callers call `line_start` and the probe.
- `can_decide_after_lf` splits in two. Its marker loop is `line_start`'s "not yet". Its character switch is the probe's -1: a probe already knows when a construct is not all here, because the dispatcher has to.
- The linefeed case of `_run_list_item` keeps its sibling marker and loose list logic, and takes everything else from the two calls.
- The `table_body` state asks `line_start` and the probe, and `row_closes_outer` goes.
- `lf_ends_inline`, `inline_lf_end`, `lf_continues`, `link_text_lf_ends`, `_delimiter_lf_close` and `bq_soft_break`, about 18 call sites, become one `line_continues(lf)`.

## 3. One cell parser

Header cells are parsed by `try_start_table` through `parse_inline_range`, a nested run of the state machine over a byte range with a sentinel state. Body cells are parsed by `table_cells` and the `table_row_content` state, with the fast paths `table_cell_text` and `table_cell_code`.

The harness gives every cell source to both and compares the children. Over 64,000 cells it found no difference. Seven fixes got them to agree, and the invariant now holds them there.

So this is the last step, not an early one, and it is optional. When it is done, the way is to parse the header row with the body path: `try_start_table` validates the delimiter row as now, then pushes the row state on the header line with the header kind, and the row state skips the delimiter line at its linefeed. `parse_inline_range` stays for directive labels. The reason to do it at all is inline math: a new break character has to be taught to `table_cell_text` and to whatever the header path scans with, and one path is one place.

## 4. Fast paths

The survey counted 24 fast paths that shadow a general path. They fall into three groups.

**Become a thin entry to the shared routine.**

- The eight text run scans (in `para_text`, `open_text_run`, `table_cell_text`, `item_para`, the inline state and others). One scan function taking the break table, since `TEXT_BREAK` is a table already. This is the step inline math needs.
- `table_cell_code`, the body cell copy of `line_code_span`. One function with the terminator as an argument.
- The block start shortcuts in `_run_list_item` (`item_para`, `item_strong`) and the root's `default` arm. They stay as guards in front of `block_start`: a first character that is not in the block start table opens a paragraph at once.

**Stay as they are, for speed.**

- `para_text`, the hot path of prose.
- `line_code_span`, `fence_whole` and `span_para`.
- The plain cell check at the top of `table_cells`. The perf notes record a 4% cost on table documents for one helper call there.
- The "alone" shortcut of `open_spec_tag`.

**Go away with the restructure.** The hand copies of prefix stripping inside fast paths (`para_text` leaves block quotes to the slow path today for this reason).

**The rule for adding one.** A fast path is allowed when an invariant compares it with the general path on every generated document. The cheap way to get that: guard each fast path with a build constant (`if (FAST && ...)`), which the dist build folds to `true` at no cost, and add a second vitest project that defines it `false`. The harness then runs under both and the trees must match. A fast path with no guard does not merge.

## 5. Speculation

The parser has eight ways to open a node before it knows the node is real, and 18 `out.revoke` sites in 14 functions (`revoke_stale_pending`, `revoke_stale_html`, `end_spec_para`, `finalize_list_pending_paras`, `unwind_inline_for_table`, `close_node_inside_html`, `code_span_in_cell`, `table_merge`, the link text state three times, and others). A comment in the main loop says a whole parse and a fed parse reach a revoke at different turns, and that the order decides where text splits.

**Leave it.** The harness checks every document for a node revoked twice, closed after a revoke, an empty text node, metadata on repaired text, and for a fed tree or a wire tree that differs from the whole one, positions and text splits included. 448,000 sources, 64,000 of them edited to leave constructs open, gave no failure in any of these. Revoke order is not producing bugs on this grammar now.

Unifying eight mechanisms would be the largest change in this note and the evidence does not ask for it. Two things to watch instead:

- Step 1 of §8 makes more containers call `open_spec_para` and `open_spec_tag`, the tag paragraph speculation. That is new ground for it (a quote and a list item never ran it). The harness covers those containers, and the step should not merge without a wide census.
- If a later census shows a `fed split` group (same tree, different text split), that is the revoke order problem arriving, and the time to revisit.

## 6. A principle for PFM.md

Proposed text:

> **Containers.** A block quote, a list item, an HTML element, a Svelte block and a container directive all hold the same blocks as the document does. A container defines only what its lines start with (a `>` for a quote, an indent for a list item, nothing for the others) and where it ends. Anything that is a block at the top of a document is the same block inside any of them.

What it decides, with no further ruling:

| issue               | under the principle                                                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| #1019               | a table opens in a block quote                                                                                                                                                       |
| #1020               | an element opens in a list item, and `script`, `style` and a comment there are blocks                                                                                                |
| #1021               | a svelte block opens in a quote, an item and a directive                                                                                                                             |
| #1022               | a comment line is a block in every container                                                                                                                                         |
| #1023               | a definition is read in an element                                                                                                                                                   |
| #1024               | an element in a directive in a quote is the block it is elsewhere                                                                                                                    |
| #1025               | a directive ends with the item that holds it, as every container ends its children                                                                                                   |
| #1047, #1048, #1060 | a table in a list item keeps its rows, and a table ends where a paragraph would                                                                                                      |
| #1049               | a line of only tags has no paragraph in any container                                                                                                                                |
| #1050               | an element in a quote holds blocks                                                                                                                                                   |
| #1051               | `- - a` is a list in a list item                                                                                                                                                     |
| #1053, #1057        | what ends a paragraph at the root ends it in a quote. The sentence in `PFM.md` that lists what ends a quoted paragraph becomes "a marked line that is blank or starts another block" |
| #1056, #1059        | a fence and a thematic break in a list item behave as at the root                                                                                                                    |

What it decides only halfway:

- **#1002** (text after a block level element on its line). The principle says the answer is the same in every container, and today it is not: `<!-- a --> b` is a comment and a paragraph at the root and one paragraph in a quote (#1052), and `<b>a`, `b</b> c` is an element and a paragraph at the root and one paragraph in a quote (#1058). It does not say which answer. `PFM.md` already does for phrasing content ("any text outside the tags wraps the whole paragraph in one"), which makes the quote right and the root wrong in both. For a block level element the ruling of #1002 is still needed.

The exceptions it needs, which are the harness's table of intended differences:

1. Frontmatter and imports belong to the file, not to the root as a container.
2. A tight list item holds the content of a paragraph with no paragraph node.
3. In a list item: a task marker, the rest of whose line never opens a block. Any ordered marker ends a paragraph there, where elsewhere only `1.` does. `- ---` is a thematic break, as in CommonMark.
4. A phrasing element holds inline content, and a raw text element holds text.
5. A table cell is not a container. It holds inline content only.
6. Lazy continuation: none for a quote, and a list item's paragraph still continues onto an unindented line.
7. Link reference definitions in a quote and a list item, if the maintainer keeps them root only (§10).

## 7. Perf

Measured, not guessed. Two prototypes on scratch copies of `next` (f20a7cae), never pushed and deleted since:

- **A, one container.** `block_start` as in §2, written from the svelte branch's dispatch plus the root's comment and autolink arms, and called by `_run_directive_container` in place of its own cases. Nothing else changed.
- **B, three containers.** A, and the root and `_run_svelte_branch` call it too. The root keeps its linefeed and whitespace cases and its plain paragraph path inline: a first character that is in a 128 entry table of block start characters calls `block_start`, any other opens the paragraph and calls `para_text` as today.

|                                                   | base    | A       | B       |
| ------------------------------------------------- | ------- | ------- | ------- |
| parser tests failing (of 6,026)                   | 0       | 0       | 1       |
| `_run` bytecode (limit 61,440, test bound 55,000) | 36,231  | 36,231  | 32,026  |
| `dist/main.js`                                    | 311,065 | 312,201 | 302,263 |

The one failure in B is a snapshot of a svelte tutorial page, where a comment in a svelte block loses the paragraph that #1022 calls a bug.

`ab.mjs --suite core --repeat 2` against a private baseline of the same commit, 238 workloads, 16 rounds, the default 3.0% floor (no calibration in this checkout). Positive is faster.

| mode           | A            | B            | B, pass 1 and pass 2 |
| -------------- | ------------ | ------------ | -------------------- |
| parse          | +0.09%       | +0.52%       | +0.38%, +0.57%       |
| incremental-64 | +0.05%       | -0.20%       | -0.21%, -0.66%       |
| render         | -0.05%       | -0.09%       | -0.03%, +0.09%       |
| render-mapped  | +0.04%       | -0.07%       | -0.05%, -0.07%       |
| compile-mapped | +0.10%       | -0.06%       | +0.06%, -0.18%       |
| sourcemap-v3   | -0.05%       | +0.03%       | +0.21%, +0.06%       |
| vite-transform | -0.12%       | -0.10%       | +0.67%, -0.03%       |
| all 238        | +0.01%       | +0.06%       |                      |
| anchor drift   | +1.4%, +0.0% | -0.0%, -0.1% |                      |

- **A is level.** No mode moves by more than 0.3%. One row is past the floor, `real/site-src-components-cheatsheet:vite-transform` at -3.9% (-5.3% and -3.9% by pass). It is a 2.6 microsecond row, the parse row of the same file is +0.1%, and A changes no code that file runs. I read it as layout noise and did not chase it.
- **B is a small trade, in favour of prose.** No row is slower past the floor and five are faster: the paragraph heavy fixtures by 3.7 to 4.4% and `fixtures/frontmatter:parse` by 12%, both passes agreeing. That is the smaller `_run`. The cost is on documents that are mostly block starts, which now pay a call each: `micro/import:parse` -2.7%, `fixtures/html:parse` -2.2%, `micro/table:parse` -2.0%, and the 64 character feed of the heading, fence and component micros by 2.0 to 2.5%. These agree across passes too, so they are real, and they are under the floor.

What that implies for all six:

- **The dispatcher itself is not a perf risk.** The root was the case to fear, since its dispatch is inside `_run`, and moving it out came back net positive.
- **The other three containers are already cold helpers** (`_run_html_block_element`, `_run_block_quote`, `_run_list_item`), as the directive state was in A. Their dispatch moves from one cold function to another. I expect them to measure as A did.
- **The small rows that pay are a ledger entry, not a stop.** If they matter, the first thing to try is to keep the two or three most common arms (heading, list marker) in front of the call in the root.
- **This says nothing about `line_start`.** The paragraph linefeed is the hot path it touches and that step needs its own A/B. The design keeps it to one integer compare when no quote or list item is open, which is what the code does today.

## 8. Migration

Each step is one PR against `next`. "Preserving" means the harness passes with the same `KNOWN` table and `parity.mjs` shows no divergence. A fixing step removes the rules of the issues it names and reruns the census over a wide seed range.

| step | what                                                                                                          | kind                                                                       |
| ---- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 0    | the harness (this PR)                                                                                         | tests only                                                                 |
| 1    | `block_start`, used by the container directive                                                                | fixes #1021 and #1022 in a directive, #1049 in a directive                 |
| 2    | the svelte branch and the root use it                                                                         | preserving for the root, fixes #1022 in a branch                           |
| 3    | the element state uses it                                                                                     | fixes #1023                                                                |
| 4    | the probe: `is_block_interrupt` and the checks of the `table_body` state become `block_start(probe)`          | fixes #1048, #1060                                                         |
| 5    | the container stack and `line_start`, used by the block quote state and the paragraph linefeed                | preserving                                                                 |
| 6    | the block quote state calls `block_start`, and `bq_line_ends_para` goes                                       | fixes #1019, #1021 in a quote, #1053, #1057                                |
| 7    | the list item state uses both                                                                                 | fixes #1021, #1022 and #1049 in an item, #1025, #1047, #1051, #1056, #1059 |
| 8    | the element, branch and directive states read lines through `line_start`, and leaves store prefix free values | fixes #1020, #1024, #1050, #1054, #1055                                    |
| 9    | one text run scan                                                                                             | preserving                                                                 |
| 10   | one cell parser (optional)                                                                                    | preserving                                                                 |

That is nine PRs after the harness, ten with the optional one. #1002, #1052, #1058 and #1062 are about the root's tag paragraphs and are separate from this: they need the ruling, then one fix. #1061 and #1063 are one-off fixes with no structure behind them.

**The riskiest step is 8.** Steps 1 to 4 move code that already exists behind one name, and the prototype did the first two and found them close to free. Steps 5 to 7 replace prefix handling in the two states that already do it. Step 8 gives prefix handling to three states that have never had it, and those states hold the tag stack, the pending element logic and `fence_ends_elements`, where most of the speculation lives. It is also the step that fixes the bugs that lose content, so it is not one to drop. It should be its own PR with a census of at least the size used here, and it is the one place I would expect a second PR of fallout.

**Where the new syntax goes.**

- **Footnotes, first PR** (a definition of one paragraph, a reference): after step 4. A definition is then one arm in `block_start` and one row in the interrupt column, in place of up to eleven edits. It can go earlier, after step 3, if the table body is taught by hand.
- **Footnotes, second PR** (a definition that holds blocks, continued by indent): after step 7. It is a container whose prefix is an indent, which is a frame in the stack and a row in `line_start`, not a seventh container state.
- **Inline math:** after step 9, and step 9 does not depend on steps 1 to 8, so it can be done first if math is wanted soon. Math is a code span in dollars, so with step 8 done it also gets prefix free lines for nothing.

## 9. The case against

**What a restructure could break.**

- Speed. `_run` sits near what TurboFan will optimise and has moved by 0.4% for a check added in a `default` arm. §7 measures the first step, not the last.
- Fed parsing. `can_decide_after_lf` is a pile of small decisions about when a fed parse may commit. Splitting it between `line_start` and the probe has to keep each of them, and a wrong one shows as a stall or as a different text split, not as a wrong tree. The harness checks both, with a cut at every offset.
- Snapshots. Block level `line_break` nodes differ by container today (the root emits one per newline, a quote one per blank line, a list item none). One routine will make them the same, and every snapshot with a quote or a list in it moves once.
- The tag paragraph speculation, as in §5.

**What it costs against patching.** Patching has a known price now: the `KNOWN` table has 25 entries, so about that many fixes, each adding an arm to one of six switches or a clause to one of five predicates, with `_run`'s helpers growing each time. The last three stacks ran at 6 to 13 new finds per round because each fix was checked by a fuzz of its own area. With the harness that stops being true: a patch is checked against every container at once. So patching with the harness is a real option, and it is bounded.

What patching does not buy is the next construct. A footnote definition is a block that has to open, interrupt, and end a table in every container: up to eleven sites. Inline math is a break character in about twenty-two guards and eight scans. Each is a new round of "one copy lacks what another has", found by the harness after the fact in place of being impossible.

**What would change my mind.**

- If §7 had shown a cost past the ledger's stop line (3% on a mode) for the root, with no way to keep the plain paragraph path inline. It showed the opposite.
- If the census had put the failures in speculation or in fed parsing. Then the dispatcher would be the wrong thing to restructure. It put none there.
- If the prototype had broken many tests. It broke one snapshot, for a comment in a svelte branch that #1022 calls a bug.
- If the maintainer rules against the principle of §6 and wants containers to differ by design. Then the per container table of §2 grows, the shared dispatcher saves less, and patching each cell to its own ruling is the honest way.
- If footnotes and inline math are dropped or far off. Then the 25 fixes are the whole job, and patching with the harness is cheaper than nine PRs of structure.

## 10. Decisions for the maintainer

My pick first in each.

1. **Adopt the principle of §6 in `PFM.md`.** Or keep containers different where they are today and rule on each cell.
2. **Restructure in the order of §8.** Or patch the `KNOWN` table entry by entry with the harness as the guard.
3. **Link reference definitions in a block quote and a list item: read them,** as CommonMark does and as the principle says. Or keep them root only, which also settles where a footnote definition may sit (the footnotes note assumes root only).
4. **#1002: a block level element that starts a line is a block, and text after its close tag starts a paragraph,** the pick of the third stack's note. Or keep "never wrapped" and make the containers match the root.
5. **`- - a`: a list inside the item.** Or keep it as an empty item and document that a marker line holds one marker.
6. **A value that ran over prefixed lines is stored without the prefixes by the parser.** Or the renderer keeps stripping, and learns the list indent and the comment.
7. **Footnotes after step 4 and inline math after step 9.** Or footnotes first on today's structure, paying the eleven sites once.
