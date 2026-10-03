# parse

## 1.0.0-next.1

### Minor Changes

- [#879](https://github.com/pngwn/MDsveX/pull/879) [`79bebc9`](https://github.com/pngwn/MDsveX/commit/79bebc937b5c51d7fb50d06ff09f83bf23d44a87) Thanks [@pngwn](https://github.com/pngwn)! - Leaf and container directive labels now take inline markdown, as inline directive text does. A directive component's `label` snippet renders it, so `:::Callout[Heads *up*]` passes `Heads <strong>up</strong>`. Links, images and autolinks stay literal, and nothing in a label reaches past its closing `]`, so `::x[*a](k=*)` keeps `*a` as text and its args intact.

  In the parse tree the label is a `directive_label` node, the directive's first child, so a container's label stays apart from its body:

  ```
  directive_container name="Callout"
    directive_label
      text "Heads "
      strong_emphasis
        text "up"
    paragraph
      text "body"
  ```

- [#821](https://github.com/pngwn/MDsveX/pull/821) [`ed11417`](https://github.com/pngwn/MDsveX/commit/ed11417775290f85a0b14dda03d1c11d48bbd239) Thanks [@pngwn](https://github.com/pngwn)! - Export `normalize_newlines` and `raw_offsets`, so tools that read parser positions can map them back to a source with `\r\n` line endings.

  ```ts
  const offsets = raw_offsets(source); // null when there is nothing to map
  const start = offsets ? offsets.to_raw(node_start) : node_start;
  ```

- [#866](https://github.com/pngwn/MDsveX/pull/866) [`60da683`](https://github.com/pngwn/MDsveX/commit/60da68313df11747bdd6235dffc325c30af60cb2) Thanks [@pngwn](https://github.com/pngwn)! - Paragraphs around HTML, components and Svelte tags follow one rule:
  - A paragraph of only tags, components, `{@...}` tags and whitespace gets no `<p>`, and keeps its spaces and line breaks.
  - Any text outside the tags wraps the whole paragraph in a `<p>`, so `<X /> hello` renders `<p><X /> hello</p>` instead of splitting it.
  - A paragraph holding a block level element such as `<div>` or `<p>` is never wrapped.

  An element that opens and closes on the same line holds inline content, so `<div><p>hi</p></div>` no longer gets an extra `<p>` inside it. One that stays open past its line holds blocks as before, and an element like `<p>`, `<span>` or `<button>` never wraps its content in `<p>`.

  A `{#if}` style block opener at the start of a line now ends the paragraph before it.

  ```md
  <Chart />
  <Legend />

  <Badge>new</Badge> in this release
  ```

### Patch Changes

- [#864](https://github.com/pngwn/MDsveX/pull/864) [`cfee8d1`](https://github.com/pngwn/MDsveX/commit/cfee8d1a968ac78329e314650c51785968bf1dff) Thanks [@pngwn](https://github.com/pngwn)! - A backtick followed by a space at the very end of the input stays literal text instead of becoming an unclosed code span.

- [#866](https://github.com/pngwn/MDsveX/pull/866) [`29b6dd1`](https://github.com/pngwn/MDsveX/commit/29b6dd127efc0d00dff650d320d4d003f6d2b1b6) Thanks [@pngwn](https://github.com/pngwn)! - A closing tag of an enclosing HTML element or component on its own line now ends the paragraph or list item before it, so the line break and indentation before the tag no longer end up inside the paragraph.

  ```md
  <Card>
    - one
    - two
  </Card>
  ```

- [#880](https://github.com/pngwn/MDsveX/pull/880) [`7815ee9`](https://github.com/pngwn/MDsveX/commit/7815ee9d0993774f6f648d46d35ce3f900a6eed4) Thanks [@pngwn](https://github.com/pngwn)! - A container directive inside a block quote parses its quoted body lines as normal content, and `> :::` closes it.

- [#878](https://github.com/pngwn/MDsveX/pull/878) [`db0418d`](https://github.com/pngwn/MDsveX/commit/db0418d50bcd286a062cd0b6243a234167d11781) Thanks [@pngwn](https://github.com/pngwn)! - Bullet and ordered lists inside a container directive (`:::name[]`) parse as lists instead of paragraphs.

- [#855](https://github.com/pngwn/MDsveX/pull/855) [`98a1b87`](https://github.com/pngwn/MDsveX/commit/98a1b87b1c45f192c93bf3b910d6ebc8284b94f4) Thanks [@pngwn](https://github.com/pngwn)! - Parsing markdown is much faster, up to about 3x, and incremental (streaming) parsing is faster as well. Parsing many documents in a row reuses one parser instead of creating a new one for each document.

- [#862](https://github.com/pngwn/MDsveX/pull/862) [`31aa6e2`](https://github.com/pngwn/MDsveX/commit/31aa6e20390c6fa656845add1d19e0439dda48c7) Thanks [@pngwn](https://github.com/pngwn)! - Parsing, compiling, parse plugins and the vite plugin are faster for documents of every size. The largest gains are in compiles with parse plugins and in the vite plugin, where chaining the Svelte compiler's sourcemap no longer goes through a general purpose remapper.

- [#865](https://github.com/pngwn/MDsveX/pull/865) [`fd54579`](https://github.com/pngwn/MDsveX/commit/fd5457966ce23d1eb29a7935a550394adf4498e4) Thanks [@pngwn](https://github.com/pngwn)! - Parsing, incremental parsing, compiling with and without sourcemaps, parse plugins and the vite plugin are faster again for documents of every size, with the largest gains on small documents, sourcemapped compiles and Windows line endings.

- [#885](https://github.com/pngwn/MDsveX/pull/885) [`e804671`](https://github.com/pngwn/MDsveX/commit/e804671afb412c81ce5cb38c40588257d34ab99d) Thanks [@pngwn](https://github.com/pngwn)! - A fenced code block that ends at the end of the input no longer overwrites the label value of the container directive around it.

- [#885](https://github.com/pngwn/MDsveX/pull/885) [`e804671`](https://github.com/pngwn/MDsveX/commit/e804671afb412c81ce5cb38c40588257d34ab99d) Thanks [@pngwn](https://github.com/pngwn)! - A fenced code block whose opening line is the last line of the input is an empty code block with that info string, instead of taking the whole document as its value.

- [#859](https://github.com/pngwn/MDsveX/pull/859) [`2f981d8`](https://github.com/pngwn/MDsveX/commit/2f981d84b04a718dae82f79e6a9243868444f88c) Thanks [@pngwn](https://github.com/pngwn)! - Content after an unclosed `*`, `_`, `~`, `^`, `[` or HTML tag in a heading is no longer dropped. The heading ends at the line end and the next line is parsed as usual. The same holds for an unclosed `[` before a heading, list item, block quote, fence or rule, and a link can now continue across block quote lines.

- [#864](https://github.com/pngwn/MDsveX/pull/864) [`cfee8d1`](https://github.com/pngwn/MDsveX/commit/cfee8d1a968ac78329e314650c51785968bf1dff) Thanks [@pngwn](https://github.com/pngwn)! - Trailing whitespace after an inline element at the end of a heading no longer leaves an empty text node in the heading.

  ```md
  # <b>
  ```

- [#854](https://github.com/pngwn/MDsveX/pull/854) [`6f4a27d`](https://github.com/pngwn/MDsveX/commit/6f4a27da11241056ef4912618cefee521525a82a) Thanks [@pngwn](https://github.com/pngwn)! - Content after an HTML block that contained a list, blockquote, table or Svelte block is no longer dropped when the closing tag sits on the same line as that content.

- [#861](https://github.com/pngwn/MDsveX/pull/861) [`585a698`](https://github.com/pngwn/MDsveX/commit/585a698f25fd0b6160e25bf0022e3cdabde65172) Thanks [@pngwn](https://github.com/pngwn)! - Incremental parsing waits for the character after `^` or `~~` before deciding whether it opens superscript or strikethrough, so a `^` or `~~` at the end of a line stays text, the same as in a full parse.

- [#847](https://github.com/pngwn/MDsveX/pull/847) [`65c9784`](https://github.com/pngwn/MDsveX/commit/65c9784b51209c7706eebaada3e9908bda9d5fa4) Thanks [@pngwn](https://github.com/pngwn)! - Incremental parsing now ends an unclosed code span at a blank line, like a full parse does, even when a chunk ends right after the line break before it.

- [#862](https://github.com/pngwn/MDsveX/pull/862) [`31aa6e2`](https://github.com/pngwn/MDsveX/commit/31aa6e20390c6fa656845add1d19e0439dda48c7) Thanks [@pngwn](https://github.com/pngwn)! - Incremental parsing gives the same result as parsing the whole document when a chunk ends right after a `+` or `1.` list marker with no content yet, or inside an open tag whose attributes contain a `>`.

  ```md
  - x
    <C b={x > 1}>y</C>
  ```

- [#861](https://github.com/pngwn/MDsveX/pull/861) [`585a698`](https://github.com/pngwn/MDsveX/commit/585a698f25fd0b6160e25bf0022e3cdabde65172) Thanks [@pngwn](https://github.com/pngwn)! - Incremental parsing waits for the character after a whole run of `#` before deciding whether a line starts a heading, so a line like `##text` that ends a chunk still continues the paragraph above, the same as in a full parse.

- [#861](https://github.com/pngwn/MDsveX/pull/861) [`585a698`](https://github.com/pngwn/MDsveX/commit/585a698f25fd0b6160e25bf0022e3cdabde65172) Thanks [@pngwn](https://github.com/pngwn)! - Incremental parsing waits for enough of the next line before deciding whether a line break ends unclosed link text, directive text or an inline HTML element, so text like `*:x[` followed by `#]` on the next line gives the same tree as a full parse.

- [#855](https://github.com/pngwn/MDsveX/pull/855) [`98a1b87`](https://github.com/pngwn/MDsveX/commit/98a1b87b1c45f192c93bf3b910d6ebc8284b94f4) Thanks [@pngwn](https://github.com/pngwn)! - A document that ends in a lone carriage return (`\r`) now parses the same way incrementally as it does in a single pass.

- [#865](https://github.com/pngwn/MDsveX/pull/865) [`fd54579`](https://github.com/pngwn/MDsveX/commit/fd5457966ce23d1eb29a7935a550394adf4498e4) Thanks [@pngwn](https://github.com/pngwn)! - Incremental parsing recognises a fenced code block inside a block quote when a chunk boundary splits the quote markers, matching a full parse.

- [#861](https://github.com/pngwn/MDsveX/pull/861) [`585a698`](https://github.com/pngwn/MDsveX/commit/585a698f25fd0b6160e25bf0022e3cdabde65172) Thanks [@pngwn](https://github.com/pngwn)! - Incremental parsing recognises a `---`, `***` or `___` line inside an HTML block, a Svelte block or a directive container as a thematic break when it is the last line fed so far, instead of turning it into a paragraph.

  ```md
  ## <div>
  ```

- [#861](https://github.com/pngwn/MDsveX/pull/861) [`585a698`](https://github.com/pngwn/MDsveX/commit/585a698f25fd0b6160e25bf0022e3cdabde65172) Thanks [@pngwn](https://github.com/pngwn)! - Incremental parsing waits for the character after a closing `~` or `~~` before closing subscript or strikethrough, so text like `~a~~` or `~~~~a` gives the same tree as a full parse.

- [#866](https://github.com/pngwn/MDsveX/pull/866) [`29b6dd1`](https://github.com/pngwn/MDsveX/commit/29b6dd127efc0d00dff650d320d4d003f6d2b1b6) Thanks [@pngwn](https://github.com/pngwn)! - List items indented by the same amount are siblings again. The first item's indent was measured after its leading whitespace had been skipped, so later items nested under it. This affected any indented list, including lists inside HTML elements and components.

  ```md
  <div>

      - one
      - two

  </div>
  ```

- [#862](https://github.com/pngwn/MDsveX/pull/862) [`31aa6e2`](https://github.com/pngwn/MDsveX/commit/31aa6e20390c6fa656845add1d19e0439dda48c7) Thanks [@pngwn](https://github.com/pngwn)! - Documents keep everything after a paragraph with more than a hundred or so unmatched `*`, `_`, `[`, `~~` or inline HTML tags, and after an unclosed `[` inside a table, instead of ending early.

  ```md
  ## ||

  [
  d
  ```

- [#852](https://github.com/pngwn/MDsveX/pull/852) [`9903c3a`](https://github.com/pngwn/MDsveX/commit/9903c3ad8d764085285486816736c4f3ea140a99) Thanks [@pngwn](https://github.com/pngwn)! - Streaming a document with `feed()` stays fast when a single list, block quote or code fence is very large. An 8000 line list or code fence fed in 64 character chunks now parses in about 50ms instead of 3 to 6 seconds.

- [#851](https://github.com/pngwn/MDsveX/pull/851) [`7e69d52`](https://github.com/pngwn/MDsveX/commit/7e69d52284e20892752041fb42726480d88cf31c) Thanks [@pngwn](https://github.com/pngwn)! - Incremental parsing with `feed()` now takes time proportional to the input size, so streaming small chunks into a large document is no longer slower than parsing it in one go. A 3.8MB document fed in 64 character chunks parses in about 0.35s instead of 27s.

- [#865](https://github.com/pngwn/MDsveX/pull/865) [`fd54579`](https://github.com/pngwn/MDsveX/commit/fd5457966ce23d1eb29a7935a550394adf4498e4) Thanks [@pngwn](https://github.com/pngwn)! - Incremental parsing stays linear for fenced code inside block quotes, long lines and list items inside block quotes, paragraphs with many brackets that are not links, and long tight lists of task boxes, links or inline html.

- [#862](https://github.com/pngwn/MDsveX/pull/862) [`31aa6e2`](https://github.com/pngwn/MDsveX/commit/31aa6e20390c6fa656845add1d19e0439dda48c7) Thanks [@pngwn](https://github.com/pngwn)! - Parsing time stays proportional to document size when a document has unmatched braces or stray `<word` text. Incremental parsing also stays linear inside long paragraphs, tables, pending emphasis and unclosed braces, frontmatter, comments, code spans or HTML and Svelte blocks, where it used to slow down with every chunk.

- [#885](https://github.com/pngwn/MDsveX/pull/885) [`e804671`](https://github.com/pngwn/MDsveX/commit/e804671afb412c81ce5cb38c40588257d34ab99d) Thanks [@pngwn](https://github.com/pngwn)! - Lines in a nested block quote stay at their own depth after a heading, thematic break, code fence or blank quoted line. A line with fewer `>` markers closes the deeper quotes instead of opening another one.

  ```md
  > > # heading
  > >
  > > stays in the inner quote
  > > back in the outer quote
  ```

- [#855](https://github.com/pngwn/MDsveX/pull/855) [`98a1b87`](https://github.com/pngwn/MDsveX/commit/98a1b87b1c45f192c93bf3b910d6ebc8284b94f4) Thanks [@pngwn](https://github.com/pngwn)! - `NodeBuffer` now stores all of a node's fields together in one typed array, so its raw per-field arrays such as `_kinds` and `_starts` no longer exist; read nodes through its accessor methods instead. Node ids passed to a custom emitter are now node buffer indices, so text nodes take an id too and the ids seen by `open` can skip numbers.

- [#853](https://github.com/pngwn/MDsveX/pull/853) [`f2e4911`](https://github.com/pngwn/MDsveX/commit/f2e4911db89f7c66f684c0da839deeb3bc46fa55) Thanks [@pngwn](https://github.com/pngwn)! - Compiling several documents with one compiler session, as the vite plugin does, no longer lets a document that ends in an unfinished heading such as `` # ` `` make later documents lose the text after their first line.

- [#885](https://github.com/pngwn/MDsveX/pull/885) [`e804671`](https://github.com/pngwn/MDsveX/commit/e804671afb412c81ce5cb38c40588257d34ab99d) Thanks [@pngwn](https://github.com/pngwn)! - A fenced code block inside a block quote closes on a quoted closing line (` > ``` `) instead of running to the end of the document. Its value is the raw source of the content lines, so every line keeps its `>` markers.

- [#859](https://github.com/pngwn/MDsveX/pull/859) [`2f981d8`](https://github.com/pngwn/MDsveX/commit/2f981d84b04a718dae82f79e6a9243868444f88c) Thanks [@pngwn](https://github.com/pngwn)! - Content after a block quote is no longer dropped when the quote's last line ends with an unclosed HTML tag and the next line has no `>`.

- [#885](https://github.com/pngwn/MDsveX/pull/885) [`e804671`](https://github.com/pngwn/MDsveX/commit/e804671afb412c81ce5cb38c40588257d34ab99d) Thanks [@pngwn](https://github.com/pngwn)! - An extra `>` marker inside a block quote paragraph starts a nested quote, matching how `>` interrupts a paragraph outside a quote.

- [#865](https://github.com/pngwn/MDsveX/pull/865) [`fd54579`](https://github.com/pngwn/MDsveX/commit/fd5457966ce23d1eb29a7935a550394adf4498e4) Thanks [@pngwn](https://github.com/pngwn)! - Sequential parse plugins visit every node added by an earlier handler, however large the document.

- [#866](https://github.com/pngwn/MDsveX/pull/866) [`60da683`](https://github.com/pngwn/MDsveX/commit/60da68313df11747bdd6235dffc325c30af60cb2) Thanks [@pngwn](https://github.com/pngwn)! - `<svelte:head>`, `<svelte:window>` and other `svelte:` elements are parsed as elements instead of URI autolinks.

- [#847](https://github.com/pngwn/MDsveX/pull/847) [`65c9784`](https://github.com/pngwn/MDsveX/commit/65c9784b51209c7706eebaada3e9908bda9d5fa4) Thanks [@pngwn](https://github.com/pngwn)! - An unclosed `*`, `_`, `~~`, `~` or `^` followed by a line that starts a list item, blockquote, fence or HTML block stays literal text, and the rest of the document parses in full.

  ```md
  1. ~1
  2. -
  ```

- [#861](https://github.com/pngwn/MDsveX/pull/861) [`585a698`](https://github.com/pngwn/MDsveX/commit/585a698f25fd0b6160e25bf0022e3cdabde65172) Thanks [@pngwn](https://github.com/pngwn)! - An unclosed delimiter keeps exactly its own characters as text. A `[` or `![` at the end of a line is no longer left as empty text, and `foo *_*` no longer repeats the `_`.

  ```md
  [
  \_
  ```

- [#861](https://github.com/pngwn/MDsveX/pull/861) [`585a698`](https://github.com/pngwn/MDsveX/commit/585a698f25fd0b6160e25bf0022e3cdabde65172) Thanks [@pngwn](https://github.com/pngwn)! - An unclosed inline directive keeps its whole opener as text. Before, a line like `:name[` that was never closed kept only the `:`.

  ```md
  :name[

  # heading
  ```

- [#852](https://github.com/pngwn/MDsveX/pull/852) [`9903c3a`](https://github.com/pngwn/MDsveX/commit/9903c3ad8d764085285486816736c4f3ea140a99) Thanks [@pngwn](https://github.com/pngwn)! - Inline HTML that is never closed and falls back to plain text now keeps its full original text, instead of a truncated or unrelated fragment.

- [#859](https://github.com/pngwn/MDsveX/pull/859) [`2f981d8`](https://github.com/pngwn/MDsveX/commit/2f981d84b04a718dae82f79e6a9243868444f88c) Thanks [@pngwn](https://github.com/pngwn)! - An unclosed HTML tag now shows its text once. Content after it on the same line is no longer repeated, and a tag that spans lines keeps all of its text.

  ```md
  a <b>x
  ```

  renders as `<p>a &lt;b&gt;x</p>` rather than `<p>a &lt;b&gt;xx</p>`.

- [#849](https://github.com/pngwn/MDsveX/pull/849) [`cbc0029`](https://github.com/pngwn/MDsveX/commit/cbc00291119021655765fd4f4e05d9f4fb320727) Thanks [@pngwn](https://github.com/pngwn)! - Backticks with no closing run stay as literal text, including every backtick in a run of two or more, and a blank line after them still ends the paragraph.

## 1.0.0-next.0

### Major Changes

- [#795](https://github.com/pngwn/MDsveX/pull/795) [`6ac3826`](https://github.com/pngwn/MDsveX/commit/6ac382615eb410230e8423d5ca4202005588869e) Thanks [@pngwn](https://github.com/pngwn)! - Add new PFM parser, renderers

### Minor Changes

- [#808](https://github.com/pngwn/MDsveX/pull/808) [`46f655f`](https://github.com/pngwn/MDsveX/commit/46f655f90a838726eda34e1b07667e86fa61e7cb) Thanks [@pngwn](https://github.com/pngwn)! - Add named argument lists to generic directives (`:name[text](key=val, key2=val2)`) for inline, leaf, and container forms. Empty lists (`()`) are allowed but ignored; malformed lists degrade to literal text (inline) or a paragraph (block). The `[content]` brackets are now required for all directive forms - empty text must be explicit (`::name[]`). Directive text accepts simple inline constructs (emphasis, code spans, strikethrough, superscript, subscript) but links, images, and autolinks stay literal text, and unescaped square brackets must balance.

- [#798](https://github.com/pngwn/MDsveX/pull/798) [`e5b7abe`](https://github.com/pngwn/MDsveX/commit/e5b7abe1ebf868b1df1e934fb96e1e363696f3e9) Thanks [@pngwn](https://github.com/pngwn)! - Add plugin system and autolink plugin

- [#799](https://github.com/pngwn/MDsveX/pull/799) [`5b54692`](https://github.com/pngwn/MDsveX/commit/5b54692d6c895f02c947ce620a46c7a9beb856e9) Thanks [@pngwn](https://github.com/pngwn)! - Add language tools

## 0.1.1

### Patch Changes

- [#359](https://github.com/pngwn/MDsveX/pull/359) [`07a3e6f`](https://github.com/pngwn/MDsveX/commit/07a3e6f8f7f163b91e1b7adc881957dac3825288) Thanks [@pngwn](https://github.com/pngwn)! - Split modules up, add new build approach with constant replacements.
