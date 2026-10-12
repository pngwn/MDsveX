# Footnotes: design

Status: accepted, 2026-10-12. Targets `next`. The maintainer's decisions are in §10: every pick stands but the third, a reference with no definition is a compile error.

Sources:
- The plugin audit (`plugins/PLUGIN_AUDIT.md`): Reference apparatus (§3.9), and priority 4 in §5.
- #927, which made `@mdsvex/migrate` keep footnotes as escaped literal text until PFM has a form for them.
- `PFM.md`: the principles, link references, and how a list item continues.
- `packages/parse/src/main.ts` (`try_parse_link_ref_definition`), `packages/render/src/html_cursor.ts` (the five walks, `wrap_pass`, `update_blocks`), `packages/render/src/Node.svelte`, `packages/mdsvex/src/heading_ids.ts`.

```md
A claim[^1], and a second one[^smith].

[^1]: The source, with a [link](https://example.com).
[^smith]: Smith, 2020.
```

## Recommendation

- **Core syntax, the GFM form:** `[^label]` for a reference and `[^label]: text` for a definition. No inline form and no directive form.
- **Two node kinds,** `footnote_reference` and `footnote_definition`. A reference is recognised by its syntax alone, so it needs no definition before it, unlike a link reference.
- **Numbered by first reference. Definitions are collected into one section at the end of the document,** wherever they sit in the source.
- **A reference with no definition is a compile error,** with the position of the reference. The parser never turns a reference back into text.
- **Two PRs.** The first is the whole feature with one-paragraph definitions. The second lets a definition hold more blocks.
- **Full footnotes are compile only.** The streaming renderer gets a small local fallback, which it needs in any case (§6).

## 0. Where we are

- **A reference is literal text today.** `A claim[^1].` renders `[^1]` as written. `[^1](url)` is literal too, not a link.
- **A definition is a paragraph, or it vanishes.** `[^1]: The source.` is a paragraph. `[^note]: Word` is read as a link reference definition with the label `^note` and the destination `Word`, so it produces no output at all and nothing warns. Any definition whose text is one word or one URL is lost this way.
- **Link reference definitions are read in every container,** through one arm of `block_start` (`design/parser-structure.md`). Inside a blockquote or a list item a definition is one line. A `[^label]: text` line is deliberately not one (#1032), so it is plain text until this lands.
- **A list item is the model for a block that holds blocks.** Its paragraph continues onto an unindented line, and a block after a blank line belongs to it when it is indented to the content column. Blockquotes are the only container with no lazy continuation.
- **`^[1]^` is a superscript.** So is anything else between two carets.
- **The renderer already renders root children out of order.** `wrap_pass` makes two passes over them, one for what hoists and one for the rest.
- **`Node.svelte` renders an unknown kind as its children.** An unknown leaf is therefore invisible.

## 1. Syntax

### 1.1 The reference

`[^label]`, inline. The label is one or more characters, none of them whitespace, `[`, `]` or `^`.

- **It is a reference wherever it parses,** whether or not a definition exists. That is what lets it come before its definition: the parser never looks anything up. A link reference can't work this way because `[ref]` is also ordinary bracketed text; `[^ref]` is not something prose contains, with one exception (below).
- **One compare on the hot path.** `[` already ends a text run. The inline `[` case checks for `^` and hands over to a cold function.
- **No caret in a label keeps superscript as it is.** `[^TM^]` stays a bracket, a superscript and a bracket.
- **It wins over a link.** `[^1](url)` is a reference followed by `(url)`. Nothing is lost, since it is not a link today either.
- **Not in directive text or the alt of an image,** where a bracket is already literal. The text of a link holds one, as it holds a link today.
- **`\[^1]` is literal,** as any escaped bracket is.
- **The exception: a negated character class in prose,** `[^abc]`, parses as a reference. It has no definition, so the compile fails at it (§2). It has to be escaped, `\[^abc]`, or put in code.

### 1.2 The definition

`[^label]: text`, at the start of a line, in any container.

- **One arm in `block_start`, ahead of link reference definitions,** so every container gets it with one edit. A link reference label can not start with `^`.
- **It needs text on its line.** `[^a]:` alone is literal text, as `- [ ]` alone is not a task item.
- **It ends a paragraph,** as a heading or a fence does. Without that, the second of two definitions on adjacent lines would be a continuation line of the first.
- **In any container,** by the containers principle of `PFM.md`: a definition is a block, and a block is the same block in a blockquote, a list item, an element, a Svelte block and a directive. `> [^a]: x` is a definition in a blockquote. Where it sits does not change the output, every definition is collected into the one section (§4).
- **The first PR: one paragraph.** It continues over the following lines, indented or not, and ends at a blank line or a line that starts a block, like any paragraph.
- **The second PR: more blocks, by the list item rule.** After a blank line, a block indented by four spaces belongs to the definition. The first line that is not blank and not indented ends it. Four is GFM's number, so the same source renders the same on GitHub. PFM has no lazy continuation for blockquotes, but list items already continue this way, so this adds no new idea.
- **The tree is the same in both PRs:** a definition node with paragraph children. Only the parser changes in the second.

### 1.3 Against the principles

| principle | |
|---|---|
| 2, no ambiguity | A reference is decided by its own characters. A definition is decided by its line. |
| 4, one way | One reference form, one definition form. |
| 7, degrades on GitHub | It is GitHub's syntax. |
| 8, minimal lookahead | A reference needs its closing `]` on the same line. A definition needs its line, which the parser already waits for at a `[` block start. |

The one place it departs from the rest of PFM is that a reference comes before its definition, where a link reference must come after. The reasons differ: a link needs its URL to render, and a footnote reference needs only its own label.

## 2. Policy

- **Numbering.** By first reference in source order. A reference inside a definition is numbered when its definition is written out.
- **Labels match exactly,** case included. GFM folds case; PFM does not guess.
- **No definition:** a compile error, a `FootnoteError` with the code `footnote_undefined` and the position of the reference. Nothing is rewritten: the parser recognises a reference by its syntax alone and never turns one back into text, so a bare parse has the node and does not throw.
- **Never referenced:** the definition is not rendered. Warning `footnote_unused`.
- **Defined twice:** a compile error, a `FootnoteError` with the code `footnote_duplicate` and the position of the second definition. The draft had the first win with a warning. An error was taken while building, on the maintainer's stated preference for a typed error over a silent fallback.
- **Referenced twice:** both show the same number, and the definition gets a back-link to each.
- **The warning** goes out as a `CompileWarning` with a position, the channel highlighting uses.
- **Ids.** The definition is `fn-{label}`, so a link to a note survives renumbering. A reference is `fnref-{n}`, and `fnref-{n}-2` for the second reference to the same note. Using the number there avoids a clash that labels allow (`a` referenced twice against `a-2` referenced once).
- **Clashes with `heading_ids`.** A heading "Fn 1" slugs to `fn-1`. Footnote ids are fixed by the label and can't move, so they are reserved: `heading_ids` seeds its `seen` map with them and the heading becomes `fn-1-1`. Both run after the parse, so the order is free.
- **Two documents on one page** (the audit's Composition concern) clash on `fn-1` as they do on heading ids. Not solved here. All ids come from one function, which is where a prefix would go.

## 3. The tree

```
paragraph
├─ text  "A claim"
├─ footnote_reference   label=1
└─ text  ", and …"
footnote_definition     label=1
└─ paragraph
   ├─ text  "The source, with a "
   └─ link
```

- **Both carry `label` as an attribute,** as a directive carries `name`. No change to the wire: attributes pass through as they are.
- **Why real kinds.** There are 36 kinds today and these make 38. Desugaring to existing kinds (a `superscript` holding a `link`) can't work: the link's text is a number that is not in the source and is not known until the definitions are, and a definition has to leave its place. Plugins, the editor and the migrator also need to tell a footnote from a link.
- **What a new kind touches,** so the PR can be checked against it: `NodeKind`, `kind_to_string` and the `<= 35` loop beside it, `repair_level`, `NODE_KIND_COUNT` in `plugin_dispatch.ts`, `KIND_NAMES` in `wire_emitter.ts`, the `K` enum in `html_cursor.ts`, `Node.svelte`, `heading_ids.ts` (a reference adds nothing to a slug, which the default arm of `text_of` already gives), the TextMate grammar, `WIRE_FORMAT.md`.
- **The parser notes that it saw a footnote,** as it notes an image with `take_src()`. A document with none never enters any of the code below.

## 4. Rendering

```html
<p>A claim<sup><a href="#fn-1" id="fnref-1" role="doc-noteref">1</a></sup>, and …</p>

<section class="footnotes" role="doc-endnotes" aria-label="Footnotes">
<ol>
<li id="fn-1"><p>The source, with a <a href="https://example.com">link</a>. <a href="#fnref-1" role="doc-backlink" aria-label="Back to reference 1">↩︎</a></p></li>
</ol>
</section>
```

- **Where.** After the last root child. With a template, that is the end of the document's own content.
- **Accessibility.** The DPUB roles name the three parts. The section is labelled with `aria-label`, not a hidden heading: mdsvex ships no CSS to hide one, and a generated heading would appear in every table of contents. The back-link goes inside the definition's last paragraph, or after its last block when that is not a paragraph. The arrow carries U+FE0E so it is not drawn as an emoji.
- **The two strings** ("Footnotes", "Back to reference {n}") are options: `footnotes: { label, back_label }`.

### 4.1 One index, built once

`footnote_index(buf, source)`: one pass that returns, for each reference, its number or 0, the definitions in number order, how many references each has, and the warnings. It lives beside `buf_utils` in `@mdsvex/parse`, so the walks, `Node.svelte`, a plugin and the editor can all call it. Compile builds it only when the parser noted a footnote and hands it to the renderer as it hands over `highlight`.

### 4.2 The five walks

- **A reference** is written in the `default` arm of each walk, as the `<sup>`. Growing the `switch` by a case has cost 7% on a micro row before, and the `default` arm has not.
- **A definition renders nothing in place,** wherever it sits. It reaches the same `default` arm and returns.
- **The section is written after the root's children,** by one helper called from each entry point. It moves the cursor to each definition in number order and renders its children with that walk's own children function. `cm_children` already picks the function by mode for the folded, traced and mapped walks.
- **Output order is no longer source order.** Mapping records carry both offsets, so nothing breaks, and hoisted scripts already do this. The escape index resets when it is asked for an earlier offset, which costs a rescan for each backward jump and only in a document with footnotes.

### 4.3 The block cache

`update_blocks` keeps one `{ idx, html }` entry for each root child and never renders a closed block again.

- **A definition's entry is empty,** so the entries stay aligned with the root's children.
- **The section is one more entry after the loop,** rendered again on every update while the document has footnotes.
- **A cached paragraph can't change when a definition arrives later.** So this path is optimistic: it numbers every label at its first reference and always writes the link. Its output differs from a compile only for a document a compile rejects, one with an undefined reference or a label defined twice.

### 4.4 Components

Two replacement names, as `math` has one:

| name | replaces | props |
|---|---|---|
| `footnote` | the reference | `label`, `number`, `href`, `id`, `children` (the `<sup>`), and `note`, a snippet of the definition's content |
| `footnotes` | the section | `children` (the `<ol>`) |

`note` is what makes side notes and hover cards possible without a plugin. The generated `<sup>`, `<a>`, `<ol>` and `<li>` are not markdown nodes, so `a` and `li` replacements never see them, the same rule as for the MathML a math renderer makes. This can follow the first PR: `comp_node` is the largest walk, and nothing else depends on it.

## 5. Why collect at the end

Rendering each definition where it is written would need no index, no second pass and no cache exception, and it would stream perfectly. It is rejected because many authors write a definition directly under the paragraph that cites it and rely on the renderer to move it, and every other implementation does. A migrated document would grow notes in the middle of its text.

## 6. Streaming

A reference can arrive long before its definition, and whether a definition exists is not known until the input ends.

- **`Node.svelte` needs a change whatever is decided,** or a reference is invisible and a definition is an unmarked paragraph in the middle of the text.
- **Recommendation: a local fallback.** A reference renders as `<sup>label</sup>`. A definition renders in place, as a block that starts with the same `<sup>`. No index, no reordering and no numbering, a dozen lines. When labels are `1`, `2`, `3` in order, which is how nearly everyone writes them, the reader sees the final numbers.
- **Full parity is possible later** through `footnote_index`, at the price of scanning the buffer on every update and a section that sits below text that is still growing.
- **So: compile only for the real thing.** The incremental HTML renderer is optimistic (§4.3), and `Node.svelte` is local.

## 7. Alternatives

**An inline form, `^[the note]`.** Pandoc has it. It is a second way to write a footnote (principle 4). `^[` already opens a superscript, so `x^[1]^` would change meaning. GitHub prints it literally (principle 7). A note of any length in the middle of a sentence is hard to read in source, and a note with no label can't be cited twice. No.

**A plugin on directives, `:fn[the note]`.** No new syntax, which is its whole appeal. It fails on four counts:
- Directive text does not accept links, and a link is the commonest thing in a footnote.
- A plugin can't move a node or remove one from its place (the audit's §4), so the collection in §4 would have to be built into the renderer anyway.
- GitHub prints `:fn[…]` literally.
- Every existing document uses `[^1]`. The migrator would have to rewrite them all into a form no other tool reads.

**Is core syntax warranted?** Yes, but the audit's ranking overstates the demand. Its signal is remark-gfm's 181M downloads, which are mostly tables and task lists. What carries the case is narrower: this is the last piece of GFM that PFM lacks, documents that use it lose their footnotes on migration (they survive only as literal text), the syntax claims nothing PFM uses, and today's handling of it has a data-loss bug. The cost is real: two node kinds and the renderer's first reordering of content. Being the largest of the three features, it should land last.

## 8. Tooling

- **Source maps.** A reference is one node record. A definition's children map as any block's do, from wherever the section put them.
- **language-tools.** Two TextMate rules: an inline `[^label]` before `#link`, and a block rule for `[^label]:`. The grammar has no rule for link reference definitions yet, so there is nothing to reorder. `pfm_to_svelte` runs `compile()`, so the mappings and the three warnings arrive with no further work. Go to definition is a later feature built on `footnote_index`.
- **`@mdsvex/migrate`.** `footnote_marker` stops escaping: a reference is written `[^label]` and a definition `[^label]: text`. After the first PR a definition with several blocks is still flattened, as it is now, with a note. After the second its later blocks are indented by four spaces. Labels with a character the grammar excludes are rewritten, in the reference and the definition together.
- **`PFM.md`** gets a Footnotes entry, and the link references entry notes that a label can't start with `^`.

## 9. Implementation outline

**PR 1, footnotes with one-paragraph definitions.**

| step | work |
|---|---|
| parser | the two kinds; the reference in the inline `[` case; the definition as an arm of `block_start`, which is the paragraph interrupt check too; the note that a footnote was seen; fed against whole parity; both in the invariance generator |
| tables | everything listed in §3 |
| index | `footnote_index`, the two errors and the warning, the ids, the `heading_ids` seed |
| render | the `default` arms, the section helper at each entry point, the block cache entry, the `footnotes` option |
| streaming | the `Node.svelte` fallback |
| around it | TextMate rules, the migrator, `PFM.md`, site docs, a playground example |
| perf | one `quick` A/B and `--suite core --modes incremental`, since `[` handling and a block start change |

**PR 2, definitions that hold blocks.** Parser only: the definition gets a frame in the container stack, and continues as a list item does. The migrator indents.

**PR 3, optional.** The `footnote` and `footnotes` replacement names.

## 10. Decisions

Decided by the maintainer on 2026-10-12. Every pick below stands except the third: "I don't want any backtracking/ rewriting. This should just throw an error." So a reference with no definition is a compile error with a position, and the parser never turns a reference back into text. Since the draft the parser was restructured, and a definition is a block that may sit in any container (§1.2).

1. **Syntax.** `[^label]` and `[^label]: text` in core (my pick). Or leave footnotes to a directive plugin, with the limits in §7.
2. **Where definitions render.** Collected at the end, in number order (my pick). Or where they are written, which is simpler and streams, and surprises anyone coming from GFM.
3. **A reference with no definition.** Its source text and a warning (my pick, not taken). Or a compile error, which is stricter and makes a negated character class in prose fail the build (taken).
4. **Definitions with more than one block.** A second PR, by the list item rule with a four space indent (my pick). Or never: one paragraph only, and longer notes use a link to a section.
5. **Markup.** `role="doc-endnotes"` with an `aria-label`, no generated heading (my pick). Or GitHub's markup, a visually hidden `<h2>` that needs a `sr-only` class from the user's CSS.
6. **Components.** `footnote` and `footnotes`, with the `note` snippet, after PR 1 (my pick). Or no replacement names, classes and attributes only.
7. **Streaming (D7).** Compile only, with the local fallback in `Node.svelte` (my pick). Or full numbering and the end section in `Node.svelte` too.
8. **Labels.** Any characters but whitespace, brackets and `^`, matched exactly (my pick). Or GFM's case-insensitive match.
