# Smart punctuation: design

Status: built, 2026-10-12, on `next`. The maintainer took every pick in §9 that day. §10 says where the code differs from the sections before it, which are kept as they were written. The audit decided that this is a core feature behind an option (`plugins/PLUGIN_AUDIT.md` §6).

Sources:
- #825, which tracks the old smartypants rewriting text that is not prose: string literals in `{…}` (#83), `--css-var="x"` on a component (#459) and the text of an autolinked URL (#424).
- The plugin audit, Typography (§3.7): remark-smartypants, 17.7M downloads a month.
- `packages/render/src/html_cursor.ts` (`escape_text_at` and the five walks), `packages/render/src/Node.svelte`, `packages/migrate/src/config.ts`.

## Recommendation

- **One option, `smart_punctuation`, off by default,** on `compile()` and the plugin. The migrator turns it on for a project that had the old default.
- **Five substitutions and nothing else:** `"` and `'` to curly quotes, `--` to an en dash, `---` to an em dash, `...` to an ellipsis.
- **It runs in the renderer, in `escape_text_at`, on text nodes only.** Everything #825 lists is no longer a text node, so two of its three cases are closed by the tree and the third needs one check (§4).
- **The quote direction comes from the two characters around the quote,** read from the source, with the tree consulted only when the quote is the first or last character of its text node.
- **Compile only.** `Node.svelte` does not get it (§7).

## 0. Where we are

- **Prose text has one exit, with three leaks.** Every walk renders a text node through `escape_text_at(c, i, vs, ve, false)`: `render_children`, `fold_children`, the `K.TEXT` case of `fold_node`, `tr_children`, `mp_children` and `wrap_pass`. `comp_node` renders children through the same loops. The leaks:
  - **Image `alt`** is collected raw by `_children_raw` and escaped by `escape_text_html`, at five sites.
  - **Link and image `title`** is a metadata string, escaped by `escape_text_html`.
  - **A stored string.** A text node a plugin wrote, and every text node of a tree built from the wire, returns early from `escape_text_at` with its string and never looks at the source.
- **Code shares the function.** Code spans and plain fences call it with `code` set to `true`. The flag already tells the two apart.
- **`fold_children` passes more than one node.** A run of text nodes and soft breaks that is contiguous in the source is rendered as one slice. So a rule can't be written in terms of "the node"; it has to give the same answer for a position whether the slice is one node or four.
- **The function is a source index, not a string pass.** It keeps the next source position of each of `&`, `<`, `>` and `"` and advances them with `indexOf`, so a text node with none of them costs four compares and one `slice`.
- **`Node.svelte` shares none of this.** It renders a text node with `buf_text` and lets Svelte escape it.
- **A straight `"` in prose is written `&quot;` today,** so a text node that holds one already has a mapping whose two lengths differ.
- **The old option was on by default** and went through retext-smartypants. Its defaults turned `--` into an em dash and ` ``x'' ` into curly quotes.

## 1. The substitutions

| source | output | |
|---|---|---|
| `"` | `“` or `”` | by the rule in §2 |
| `'` | `‘` or `’` | same rule; `’` is also the apostrophe |
| `--` | `–` | exactly two hyphens |
| `---` | `—` | exactly three |
| `...` | `…` | exactly three dots |

- **Runs of any other length stay as written.** Four hyphens are a drawn rule, four dots are an ellipsis and a full stop that the author spaced on purpose.
- **A flag is not a dash.** `--name`, two hyphens after a space or the start of the block and before a letter, is left alone. `a -- b`, `a--b` and `1--2` are dashes. This is the commonest complaint about smartypants in technical writing, and the exemption costs one character of lookahead.
- **Not included:** primes (`6'2"`), `` ``x'' `` quotes, arrows, fractions, `(c)`, guillemets from `<<`. The first needs to know whether a quote is open, which the rule in §2 deliberately does not track. The rest belong to the audit's "typographic details" row, a plugin once plugins can rewrite text.
- **The output is the character, not an entity.** A quote stays one character long, so its mapping stays an identity mapping (§6).

## 2. Which way a quote faces

A quote looks at the character before it and the character after it.

1. Space on both sides: unchanged, a straight quote.
2. Space before, anything else after: opening.
3. An opening bracket (`(`, `[`, `{`), a hyphen or dash, or a quote this rule just opened before it, and no space after: opening.
4. Anything else: closing.

"Space" is whitespace, a soft or hard break, and the start or end of the block.

```
"Hello," she said.          “Hello,” she said.
it's the dogs' bowl         it’s the dogs’ bowl
("'nested' quotes")         (“‘nested’ quotes”)
well-"known"                well-“known”
```

**At the edge of a text node the neighbour is syntax, so the tree answers.** `*"word"*` has an asterisk before its opening quote and `` `Array`'s `` has a backtick before its apostrophe. Reading the source there gives the wrong answer about half the time. So when the quote is the first character of its text node:

- no sibling before it (it starts an emphasis, a link text, an element): space;
- a soft or hard break before it: space;
- any other inline node before it (a code span, a mustache, a link, a component, emphasis): a word character.

And the mirror image when it is the last character. That gives:

```
*"word"*                    opening, closing
"*word*"                    opening, closing
`Array`'s                   apostrophe
{name}'s                    apostrophe
<b>"quoted"</b>'s           opening, closing, apostrophe
```

- **The lookup only runs for a quote at a node edge.** The node buffer has no previous-sibling word, so it walks the parent's children. That is acceptable for a rare case.
- **Known misses, all shared with every implementation that does not pair quotes:** a leading apostrophe (`'90s`, `'tis`, `rock 'n' roll`) opens, and a measurement (`6'2"`) gets closing quotes. The fix is to type the character, which always passes through untouched.
- **No pairing.** cmark's smart extension keeps a stack and matches openers to closers. That needs to know where a block starts and ends, and `escape_text_at` is called per text node with no such hook. The local rule is right for the same cases and is the only one a renderer that sees part of a block could ever apply.
- **Every script gets the same rule.** It only asks "is this whitespace" and "is this an opening bracket or a dash", so it needs no letter tables.

## 3. Language

- **One style, English curly quotes, and an option to replace the four strings:** `quotes: ['« ', ' »', '“', '”']` for French, `['„', '“', '‚', '‘']` for German.
- **No locale table and no `lang` lookup.** A table of styles by language is a data set to maintain, and there is no way yet for a document's frontmatter to set an option (the audit's "read frontmatter" gap, §4). A site in one language sets the option once.
- **A `'` with a letter or digit on both sides is always `’`,** whatever the closing single quote is. Without that the German style would write `it‘s`.

## 4. What is never touched

| what | why it is safe |
|---|---|
| code spans, fences, highlighted code | `code` is `true`, or the highlighter wrote the text |
| math, display and inline | a fence, or a code span |
| `{…}`, `{#if …}`, `{@html …}` | their own node kinds, never text (#83) |
| attribute values on elements and components, directive arguments | metadata on the node, never text (#459) |
| `href`, `src` | metadata |
| character references | `&quot;` and `&#39;` are kept as written, which also makes them an opt-out |
| HTML comments, frontmatter, imports, `<script>`, `<style>` | not text nodes |
| a thematic break, a table delimiter row, list markers | block syntax the parser consumed, there is no text node |
| a string a plugin stored on a text node | the plugin chose those characters, and it has no source to read neighbours from |

Three things are text nodes and need a check:

- **Autolink text (#424).** `<https://example.com/a--b>` is a link with one text child that spans the URL. Skip a text node whose parent is a link and whose source has `<` before it and `>` after it.
- **Text inside typed HTML that holds code.** `<code>`, `<pre>`, `<kbd>`, `<samp>`, `<var>`, `<tt>` and `<textarea>` have ordinary text children. Skip a text node with one of them as an ancestor.
- **Escaped characters.** `\"`, `\'`, `\-` and `\.` stay literal. An escape opens a new text node at the escaped character, so a hit at the start of a text node with a backslash before it in the source is escaped. `text_reference` uses the same test for `\&` today. An escape anywhere in a run of hyphens or dots keeps the whole run.

**No ancestor flag in the walks.** The obvious way to carry "inside `<code>`" is a counter that each walk raises around an element's children. That is five edits to walks that are sensitive to their size (three `case` arms once cost 7% on a micro row). The parent chain is in the buffer, so `escape_text_at` can ask instead: at the first hit in a text node, walk up from the node, and remember the answer for that parent. A text node with no quote, hyphen run or dot run never asks. Text inside a component is prose and is transformed.

## 5. `alt` and `title`

Left as written. Neither goes through `escape_text_at`, both are attribute values, and a curly quote in a tooltip is not worth a second implementation of the rule over a plain string. Heading ids are also unaffected: `heading_ids` reads the heading's text from the source, so a slug is the same with the option on or off.

## 6. Cost and source maps

- **Off must cost nothing.** The option is a module flag set per render, as `hl` is. The finding of hits needs three more pointers in the escape index (`'`, `--`, `...`; `"` is already tracked). With the option off they are never advanced. One `quick` A/B before merging, as `packages/bench/perf/LEDGER.md` asks.
- **On, the cost is per hit.** `--` and `...` are found by `indexOf` with a two and three character needle, so prose without them pays a compare. Apostrophes are the common case, and each one costs a slice and a concatenation, as an `&` does now.
- **Quotes keep their mapping.** One character in, one out, so the text node's record stays an identity record. That is better than today, where `"` becomes `&quot;` and the record loses its per-character segments.
- **A dash or an ellipsis shortens the text.** The record then has two different lengths and maps its start only. This is what a text node with an `&` does today, and nothing downstream needs changing. Splitting the record at each substitution would keep the precision and can wait until someone misses it.

## 7. Streaming

- **`Node.svelte` can't share the implementation.** It has no `escape_text_at`. When its tree comes from the wire it has no source either: text arrives as strings, in pieces, and a `--` can be split across two of them.
- **It could have its own.** The rule needs one character of lookahead, so the last quote, hyphen run or dot run of the open text node would be undecided and could flip when the next piece arrives (`–` to `—`, `”` to `“`). Closed text would be right.
- **Recommendation: compile only.** A second implementation over strings has to match the first exactly, for a feature whose whole value is finish, on a renderer whose readers are watching text arrive. The incremental renderer in `html_cursor.ts` (`update`) shares the walks, so it gets the option for free and is only ever provisional in the block that is still open.

## 8. Migration

- **`migrate_config`:** unless the old config says `smartypants: false`, write `smart_punctuation: true`. A project that relied on the default keeps its output. `quotes: false`, `ellipses: false` and `dashes: false` map to the same keys.
- **Dashes changed meaning.** The old default (`dashes: true`) made `--` an em dash. Here it is an en dash and `---` is the em dash, which is what pandoc, cmark and LaTeX do. With the old default the migrator rewrites `--` to `---` in text nodes, so the output is unchanged. `'oldschool'` needs no rewrite, `'inverted'` swaps the two.
- **Backtick quotes** (` ``x'' `) are rewritten to `"x"` in text nodes.
- **Plumbing:** `migrate()` returns a bare string and takes no config, so the dash mode has to arrive as an option, and a note for "smart punctuation was on, check your dashes" needs the `MigrateResult` shape that `migrate_config` already returns.
- **Nothing to do for #825.** Text the old option damaged is not text any more.

## 9. Decisions for the maintainer

All seven were decided on 2026-10-12, each as picked below.

1. **Default.** Off, and the migrator turns it on (my pick). Or on, as it was in 0.x. Off matches `heading_ids` and `unwrap_images`, and output that differs from the source without being asked is the kind of surprise PFM avoids.
2. **The set.** The five in §1 and nothing else (my pick). Or add primes and backtick quotes for parity with the old option.
3. **`--name`.** Left alone as a flag (my pick). Or converted like any other `--`, which is simpler to state and wrong in most technical prose.
4. **Shape.** `smart_punctuation: boolean | { quotes?: boolean | [string, string, string, string]; dashes?: boolean; ellipses?: boolean }` (my pick). Or a boolean only, with styles left to a plugin later.
5. **Language.** One style plus the four-string override, no `lang` lookup (my pick). Or a built-in table keyed by language.
6. **`alt` and `title`.** Untouched (my pick). Or transformed, with a string version of the rule.
7. **Streaming (D7).** Compile and the incremental HTML renderer, not `Node.svelte` (my pick). Or a second implementation in `Node.svelte` that accepts a flip at the open end.

## 10. What was built

The option, the five substitutions, the direction rule, the exclusions and the migration are as above. These parts differ.

**Where it runs (§0, §6).** Not in the shared path of `escape_text_at`. That function clamps a value that runs past the end of the source, a branch a whole document never takes. A render with the option sets the length it compares against to zero, so every value arrives in that branch, and the check for the option sits there. A render without the option runs the code it ran before, with no new load or compare per text node. Text goes on to `smart_text`, which has an escape index of its own (the four pointers of `esc_*` again, plus `'`, `--` and `...`), and code is escaped from its slice. Nothing in the plain path is shared or touched.

**One rule for a node and for a run (§0, §2).** No walk was edited and none carries state. `fold_children` still joins a run of text nodes and soft breaks into one slice, and the other walks still render node by node. Both give the same answer because the question is the same: inside the slice the two characters come from the source, where a soft break is a newline and so reads as space, and at either end of the slice the tree is asked. For the right end of a run that is the last node of the run, found by its value end. A seeded test renders random text through all five walks and checks they agree.

**The neighbour at a node edge (§2).** Inside a node the two characters are read from the source. At the first or last character of a node, `sp_left` and `sp_right` find the character a reader would see beside it, which is more than §2 asked for:

- a text sibling gives its last or first character, a stored string included;
- a soft break, a hard break and a line break are space;
- emphasis, strong, strikethrough, superscript, subscript, a link, an inline directive and an inline element are looked into, so `_don_'t` ends in an apostrophe because of the `n`;
- with no sibling on that side the search goes up through the same kinds, so the quote in `a _"b"_` is judged by the space before the emphasis and the one in `(_"b"_)` by the bracket;
- a code span, an expression, an image and a `{@tag}` read as a word, as §2 has it;
- a comment and an empty text node render nothing and are skipped;
- anything else is the edge of a block, and so is typed HTML with a block tag (`p`, `div`, `li`, `td`, `br` and the rest of `SP_BLOCK_TAGS`), so `<td>a</td><td>"b"</td>` opens the second quote.

A quote that ends the node before is asked which way it faced, so `"_'a'_"` nests. The child list has no back links, so the search for a previous sibling resumes from the last pair it found, which keeps a long paragraph linear.

**The checks of §4.**

- Autolink text: a text node whose parent is a link that starts with `<` in the source. No look at the text itself.
- Typed HTML that holds code: asked once per parent at the first hit, as §4 describes. `script` and `style` are in the set too.
- Escapes: the test is an odd run of backslashes before the node (`brace_escaped`), so `\\"` is an escaped backslash and a live quote. A run of hyphens or dots is kept when the node starts at an escaped one, or when it ends where the next node starts behind a backslash.

**The flag.** `--name` is a flag when the hyphens follow a space, a break or the start of a block and a letter of the same text node follows. `--` at the end of a node is a dash, whatever comes next.

**Quote strings.** The four strings are text. A `<` or a brace in one is escaped, a character reference is kept, so `&nbsp;` works. Anything but four strings throws.

**A word, for the apostrophe (§3).** Only the apostrophe rule asks whether a neighbour is a letter or digit, and only when the closing single quote is not `’`. It uses ranges and not a table: ASCII letters and digits, and every character from U+00C0 up apart from the general and CJK punctuation blocks.

**Stored strings and the wire (§4, §7).** A text node with a stored string is returned before the option is looked at. Every text node of a tree built from the wire is one, so the HTML renderer shows such a tree as written, the same as `Node.svelte`. Nothing reads a source that is not there.

**Source maps (§6).** As described, with one case worth knowing. A record is read as a copy of the source when its two lengths match. A dash or an ellipsis shortens the text and an `&`, `<`, `>` or a straight `"` lengthens it, so in a text node that has both the lengths can come out equal (`a & b... c...`). The record then claims a copy, and positions between the first and last substitution are off by the few characters that cancelled. Positions outside them are right, and so is every other node. Splitting the record per substitution would fix it, with the precision §6 already left for later.

**Heading ids (§5).** From the text as written, pinned by a test: turning the option on changes no anchor.

**Migration (§8).**

- `migrate_config` adds `smart_punctuation: true` to a config with no `smartypants`, also for `mdsvex()` with no options, renames `true`, removes `false`, and maps an object key by key. `dashes: 'oldschool'` becomes `true` with no note, `'inverted'` becomes `true` with one, `backticks` is removed.
- The dash mode reaches the documents as `migrate(source, { smartypants })`, the 0.x value itself. `migrate` still returns a string. The note that says to do this comes from `migrate_config`, kind `smart_punctuation`.
- With the 0.x default, `--` becomes `---`. 0.x left `---` alone, so it becomes `\---` and stays three hyphens.
- A backtick quote becomes `"`, or the curly character when the old config had `quotes: false`, since nothing would curl it.
- Not mapped: 0.x also read `. . .` as an ellipsis, and it gave `--name` a dash where the flag rule now leaves it.

**Left open.**

- `-->` and `<--` have exactly two hyphens, so they get an en dash, as the five substitutions say. Arrows were out of scope in §1. Leaving a run that touches `<` or `>` alone would be one more exemption beside the flag.
- `Node.svelte` has no implementation, by decision 7.

