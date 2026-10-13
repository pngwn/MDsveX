# Penguin-Flavoured Markdown (PFM)

A markdown variant for mdsvex. Uses CommonMark as baseline. Goals: remove ambiguity, eliminate redundant syntax, add essential missing features.

**Guiding principles:**

1. Markdown is learned, not intuitive, tweaking it doesn't break anything sacred
2. Ambiguity is bad for users and parsers
3. Invisible syntax is bad
4. Multiple ways to do the same thing is bad
5. The 80% case should be covered without extensions
6. Markdown is not a "compile to HTML" language, though that's the primary target
7. Output should degrade reasonably in standard parsers (GitHub/GitLab)
8. Strictness enables optimistic and incremental parsing, ambiguous input is a parse error, not a fallback. True streaming is not achievable with any markdown-like syntax, but stricter rules minimise required lookahead and reduce the space of possible re-interpretations. Where ambiguity remains (e.g. tables, inline delimiters), the parser can commit to the most probable interpretation based on real-world document profiling, pathological inputs that nobody actually writes don't need to be handled gracefully.

---

### Changes from CommonMark

**Characters**, A NUL character (U+0000) in the source is ordinary text. It means nothing to the parser and is kept as written. CommonMark replaces it with U+FFFD, which would mean reading the whole source once more before every parse to look for one.

**Indentation**, Indented code blocks removed. Fenced code blocks only. Indentation is now insignificant.

**Fenced code**, A fence closes at a line that holds only backticks, at least as many as opened it, with spaces or tabs before and after them, as in CommonMark. A line with anything else after the backticks is code:

````markdown
```md
```js
let x;
```
````

-> one fence with the info `md` whose code is the lines ` ```js ` and `let x;`.

**Link references**, Shorthand references must be explicit. `[ref]` alone is ambiguous (is it a link or plain text?). Required form:

```markdown
[ref]: url

[ref][]
```

The definition must appear **before** the reference is used. Forward references are a parse error. This enables true streaming and incremental parsing.

A definition may sit in any container. In a block quote or a list item it is written on one line, the destination and the title do not move to the next line there.

A label cannot start with `^`. `[^note]: text` is a footnote definition, so the line is never a link reference definition.

**Footnotes**, A reference is a label in brackets after a caret, and a definition is the same at the start of a line with a colon and text:

```markdown
A claim[^1], and a second one[^smith].

[^1]: The source, with a [link](https://example.com).
[^smith]: Smith, 2020.
```

A label is one or more characters, none of them whitespace, `[`, `]` or `^`. Labels match exactly, case included.

A reference is one by its syntax alone. `[^label]` is a reference wherever it stands in text, whether or not a definition exists and whether it comes before or after it, which is where footnotes differ from link references. So `[^abc]` in prose is a reference too: a bracket that is not one is escaped, `\[^abc]`, or put in code. A reference is not read in the text of a directive or the alt of an image, and `[^1](url)` is a reference followed by `(url)`.

A definition is a block. It needs text on its line (`[^a]:` alone is a reference and a colon), it ends a paragraph as a heading does, and it may sit in any container. It holds one paragraph, which goes on over the next lines, indented or not, and ends at a blank line or at a line that starts a block.

In mdsvex a reference renders as its number, by first reference, linked to its definition, and every definition a reference reaches is collected into one section at the end of the document, wherever it was written. A reference with no definition and a label defined twice are errors.

**Link destinations and titles**, A backslash escape works in a link destination and a link title as it does in text, in an inline link, an image and a definition: `[a](/u\)b "t \" u")` links to `/u)b` with the title `t " u`. An escaped brace is a literal brace there, where a bare one is a Svelte expression (`[a](/docs/{slug})`).

**Headings**, Only ATX style (`#` prefix). Setext style (`===`/ `---` underlines) removed. Trailing `#` characters are treated as heading text, not syntax.

**Lists**, Non-sequential numbers supported (`11.`, `27.` etc.). Tight vs. loose is determined locally and per-list: no blank lines between items = tight (no `<p>` wrappers), all items separated by blank lines = loose (with `<p>` wrappers). Mixed blank lines are treated as loose. No cascade behaviour, a blank line in one list never affects another.

**Task lists**, Added, as in GFM. A list item whose content starts with `[ ]`, `[x]` or `[X]`, then a space or tab, then more content on the same line is a task item. The marker is not part of the item's text. It works in ordered and unordered lists at any depth.

```markdown
- [ ] to do
- [x] done
```

The rest of the line after the marker is paragraph text and never opens a block, so `- [ ] # title` is a task item with the text `# title`. Anything else stays literal text: a marker with no space after it (`[x]done`), a marker later in the item, on a continuation line or in a later paragraph, and a marker with nothing after it on its line (`- [ ]`), which like a bare list marker is not syntax. Escape the bracket (`- \[x] text`) to start an item with those characters.

A task item renders with a disabled checkbox before its text, inside the first paragraph when the list is loose:

```html
<li><input type="checkbox" checked disabled /> done</li>
```

**Emphasis**, `_` for emphasis, `*` for strong. These are **distinct and non-interchangeable**. Intraword emphasis via a `|` marker, which is not rendered:

```markdown
_emphasis_
*strong emphasis*
*_emphasis inside strong_*
_*strong inside emphasis*_
intraword: fan|_tas_|tic
```

The `|` is the marker only directly before a `_`, `*` or `~` that opens, or directly after one that closes. Any other `|` outside a table is literal text, so `a | b`, `a || b` and `x |* y` render as written, and so does the `|` before a mark that is never closed (`fan|_tas tic`).

A delimiter opens after whitespace or punctuation, and closes before whitespace or punctuation. This applies to `_`, `*` and `~~`:

- Punctuation includes Unicode punctuation and symbols, so curly quotes, dashes, ellipses, guillemets and CJK punctuation work like ASCII punctuation: `“*quoted*”`, `word—_aside_`, `*重要*。`.
- Han, kana and hangul characters count as a boundary on the outer side of a delimiter, so CJK prose needs no marker: `这是*重要*的`. Other scripts written without spaces, such as Thai, still need `|`.
- Emoji and other characters outside the Basic Multilingual Plane count as word characters.
- A doubled delimiter nests: `**(x)**` is strong inside strong, and `~~~~(x)~~~~` is strikethrough inside strikethrough. Delimiters with nothing between them stay literal text.

**Line breaks**, Soft breaks supported as-is. Hard breaks (`<br>`) via backslash only, trailing-space syntax removed:

```markdown
hello\
world
```

The backslash is a break only between two lines of one paragraph. Before a blank line, a line that starts another block, or the end of the input it is a literal backslash, as it is at the end of a heading or a table row:

```markdown
hello\

world
```

-> two paragraphs, `hello\` and `world`.

**Containers**, A block quote, a list item, an HTML element, a Svelte block and a container directive all hold the same blocks as the document does. A container defines only what its lines start with (a `>` for a quote, an indent for a list item, nothing for the others) and where it ends. Anything that is a block at the top of a document is the same block inside any of them.

The exceptions:

- Frontmatter and imports belong to the file, so they are read at the top of a document only.
- A tight list item holds the content of a paragraph with no paragraph around it.
- A list item may start with a task marker, and the rest of that line never opens a block. Any ordered marker ends a paragraph in a list item, where elsewhere only `1.` does. `- ---` is a thematic break, as in CommonMark.
- An element whose content is phrasing only (`<span>`, `<b>`, `<p>`) holds inline content, and `<script>`, `<style>`, `<pre>` and `<textarea>` hold text, kept as written up to the close tag.
- A table cell is not a container. It holds inline content only.
- A block quote has no lazy continuation, and a paragraph in a list item still continues onto a line that is not indented.

A leaf that runs over lines (the code of a fence, a comment, the content of `<script>`, `<style>`, `<pre>` or `<textarea>`, a code span) does not hold what the containers put before its lines: the `>` markers and the indent of a list item are not part of its text. A fence, a comment or an element left open ends where its container ends.

**Blockquotes**, No lazy continuation. Every line inside a blockquote must be explicitly prefixed with `>`. The first line without a `>` prefix terminates the blockquote; there is no implicit inheritance of blockquote context from a previous line. This enables line-local parsing decisions without tracking open paragraphs in parent containers.

```markdown
> foo
> bar
```

-> single blockquote containing `foo\nbar`.

```markdown
> foo
bar
```

-> blockquote containing `foo`, followed by a separate root-level paragraph `bar`.

A paragraph in a blockquote ends at a marked line that is blank or starts another block, the same lines that end a paragraph outside a blockquote: a nested blockquote, a heading, a thematic break, a fence, a directive or the close of one, a block level HTML tag, a Svelte block, or a list item. A list item ends it as it does outside a blockquote: a bullet or `1.` with text after it, and any marker when the paragraph is in a list. Emphasis, link text, an inline HTML element or a code span still open at that line ends there too and its opening marker is literal text. Over any other marked line it carries on, as it does over a line outside a blockquote, and the `>` markers of the lines a code span runs over are not part of its code:

```markdown
> some _emphasis
> over two lines_ and <b>an
> element</b>
```

-> one paragraph with the emphasis and the `<b>` element each spanning a line.

```markdown
> _foo
> > bar_
```

-> a paragraph `_foo`, then a nested blockquote containing `bar_`.

**Paragraphs**, A paragraph of only HTML tags, components, `{@...}` tags and whitespace gets no `<p>`, and any text outside the tags wraps the whole paragraph in one:

```markdown
<Chart />
<Legend />            -> <Chart />\n<Legend />

<Badge /> new today   -> <p><Badge /> new today</p>
```

A comment counts as a tag. One that is alone on its line is a block, with no paragraph around it, and the line after it starts a block of its own. One with text after it on its line is in the paragraph of that text:

```markdown
<!-- note --> some text   -> <p><!-- note --> some text</p>
```

A block level element such as `<div>` that starts a line is a block and is in no paragraph. What follows its close tag is read as the start of a line, so text there starts a paragraph of its own:

```markdown
<div>one</div> two    -> <div>one</div><p>two</p>
```

Later in a line a block level tag is a tag like any other.

An element of phrasing content such as `<b>`, `<span>` or `<a>` that starts a line with content after its open tag is inline, and starts a paragraph, also when it closes on a later line:

```markdown
<b>bold over
two lines</b> and text   -> <p><b>bold over\ntwo lines</b> and text</p>
```

When its open tag ends the line it holds what its lines hold, as a block level element and a component do.

A tag that stays literal text counts as text here: an open tag whose element never closes, as in `<Badge /> <b>new`, and a close tag that closes nothing, as in `<Badge /></b>`. A block level tag that never closes is literal text too, so its line is a paragraph. A close tag closes the last open element of its name and every element opened inside it, so `<Badge /><b><i></b>` leaves nothing open and gets no `<p>`.

An image is text by default, so a paragraph of one image is `<p><img /></p>`. The `unwrap_images` option, off by default, makes an image count as a tag does here. A paragraph of only images and whitespace then has no paragraph node, and the images are children of whatever held it: the document, a block quote, a list item, a container directive or an HTML element.

```markdown
![a chart](/chart.png)                -> <img src="/chart.png" alt="a chart" />

![one](/1.png)
![two](/2.png)                        -> <img ... />\n<img ... />

[![a chart](/chart.png)](/full.png)   -> <a href="/full.png"><img ... /></a>

![a chart](/chart.png) Figure 1       -> <p><img ... /> Figure 1</p>
```

A link that holds only images counts as its images, so a linked image or a row of badges is unwrapped too. Anything else keeps the paragraph: text before or after an image or inside its link, a hard break between two images, emphasis around an image, or a `[` whose link never closes. Images and tags mix, `<Badge /> ![a chart](/chart.png)` has no `<p>` either. A tight list item never has a `<p>`, and with the option a loose item of only images has none while its siblings keep theirs.

**Braces**, `{` and `}` in text are a Svelte expression. To write one as text, escape it with a backslash, use a character reference (`&#123;`, `&#125;`), or put it in a code span or a fenced code block, where a brace is always text:

```markdown
a \{1 + 1\} b
```

**Tags over lines**, An open tag may run over lines, and the `>` of a close tag may stand on the line after its name, which is how a formatter writes an inline element when it may add no space:

```markdown
From <a href="/projects"
  >the projects page</a
>. More text.
```

-> one paragraph, a link and the text `. More text.` straight after it. In a block quote or a list item the `>` comes after the line prefix. A table row and a heading are one line, so a close tag there ends on it.

**Repeated attributes**, A tag that writes one attribute name more than once is still a tag. The first value is the attribute, as in HTML, and the later ones are kept beside it as written, so nothing in the source is dropped. Svelte rejects a repeated attribute when it compiles the component.

**Superscript**, Added, via `^`:

```markdown
Coming Soon ^TM^ -> Coming Soon <sup>TM</sup>
```

**Subscript**, Added, via `~`:

```markdown
x~1~ -> x<sub>1</sub>
```

**Strikethrough**, Added via `~~`:

```markdown
~~word~~
```

**Autolinks**, Only the angle-bracket form with a URI scheme. Bare URLs, `www.` addresses and email addresses are not linked: the shorthand is ambiguous, and the explicit form already exists.

```markdown
<https://example.com>
```

**Tables**, GFM pipe tables as base, with three extensions. Whitespace alignment is insignificant; only structure matters.

A table ends where a paragraph would: at a blank line, at a line that starts a block which may interrupt a paragraph (a heading, a fence, a block quote, a thematic break, a list item, a block level HTML tag, a directive, a Svelte block), and at the line that closes the element, Svelte block or container directive the table is in.

A row is one line, and nothing in a cell reads past it. An HTML tag, a comment, a Svelte expression or a `<script>` that does not end on its row is literal text.

A pipe escaped with a backslash (`\|`) does not end a cell. Inside a code span in a cell the backslash is not part of the code, so `` `string \| number` `` is the code `string | number`.

Header columns via a `||` separator. The delimiter row decides: a `||` between two delimiter cells, with an empty `||` cell at the same place in the header row, splits the columns. One `||` makes the side with fewer columns the header columns, the left side on a tie. Two `||` make header columns on both sides. In body rows, the cells in header columns render as row headers (`<th scope="row">`). In body rows a `||` at the split is one separator and a single `|` there works too. A `||` anywhere else is an empty cell, as in GFM.

Left-side headers:

```markdown
| maybe || title | title 2 |
|-------||-------|---------|
| hello || text | text 2 |
```

Right-side headers:

```markdown
| title | title 2 || |
|-------|---------||--------|
| text | text 2 || head 1 |
```

Horizontal cell merging via `|>`. A cell whose only content is `>` merges into the cell to its left, in the header row or a body row. Column count stays consistent, a merged cell counts as the columns it covers:

```markdown
| title | >   | >   |
| ----- | --- | --- |
| text  | b   | c   |
```

Vertical cell merging via `|^`. A body cell whose only content is `^` merges into the cell above:

```markdown
| title | B   | C   |
| ----- | --- | --- |
| text  | b   | c   |
| ^     | b   | ^   |
```

Merged cells must form rectangles. To merge a wide cell down, every column it covers needs a `^` in the row below:

```markdown
| a   | b   | c   |
| --- | --- | --- |
| x   | >   | y   |
| ^   | ^   | z   |
```

A marker that cannot merge stays literal text: a `>` in the first column or straight after a `||`, a `>` after a `^`, a `^` in the header row or the first body row, or a `^` under only part of a wide cell. Escape a marker (`\>`, `\^`) to keep a lone `>` or `^` as text.

Both extensions compose:

```markdown
| || spanning |> |
|-----------||-----------|---|
| left head || text | b |
```

**Generic directives**, First-class plugin syntax covering inline, leaf block, and container block cases. Replaces the need for most ad-hoc extensions:

```markdown
:name[content] ← inline
::name[content] ← leaf block
::name ← leaf block without text
:::name[content]
children
::: ← container block
:::name
children
::: ← container block without text
```

Handlers are user-supplied functions keyed by name. Names start with a letter, then `[a-zA-Z0-9_-]`.

The `[content]` brackets are optional on the leaf and container forms and required on the inline form. A leaf or container directive is alone on its line, so the colons and the name already tell it from prose: `::name` and `:::name` are directives with no text, exactly as `::name[]` and `:::name[]` are. After the name only an argument list and trailing spaces or tabs may follow. Anything else keeps the line a paragraph: `::name some text`, `::name:`, `::name.`, and `:::name [text]` with a space before the bracket. A line that is only `::word` or `:::word` is therefore a directive, write `\::word` to keep it as text.

The inline form keeps its brackets, with empty text written out (`:name[]`). A bare `:name` in running text is far too common to claim: emoji shortcodes (`:tada:`), `std::vector` and any `word:word` would all become directives.

Directive text accepts simple inline constructs — emphasis, strong, code spans, strikethrough, superscript, subscript, escapes — but not links, images, or autolinks; those stay literal text. Unescaped square brackets inside the text must balance. Directives may nest: `:outer[has :inner[x] inside]`. In the leaf and container forms the brackets are matched first, with brackets inside a code span left out, and nothing in the text reaches past the closing `]`: `::name[*a](k=v)` keeps `*a` literal.

An optional argument list may follow the brackets immediately (no space), or the name of a leaf or container written without brackets. Arguments are named only — no positional values:

```markdown
:name[] ← empty text is explicit on the inline form
:name[text] ← args are optional
:name[text](arg_one=val_one, arg_two=val_two) ← key=value pairs, comma separated
:name[text]() ← empty args are allowed but ignored
::name(arg_one=val_one) ← a leaf or container may leave the brackets out
```

When a leaf or container has both, the brackets come first: `::name(k=v)[text]` is a paragraph.

Keys start with a letter or underscore, then `[a-zA-Z0-9_-]`. Values are bare (no whitespace, commas, parens, quotes, or backslashes) or single/double quoted (backslash escapes the delimiter; values are kept raw). Spaces and tabs are allowed around `=` and `,`. Duplicate keys, trailing commas, empty values, and newlines make the list malformed: an inline directive then closes at `]` and the `(...)` stays literal text, a block directive line falls back to a paragraph. Attribute syntax (`{key=val}` from the upstream proposal) is not viable in mdsvex since `{}` is reserved — the parenthesised argument list above replaces it.

**Math**. Display math is a fenced code block with the language `math`:

````markdown
```math
\int_0^\infty e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}
```
````

The fence keeps the LaTeX raw, so `{}`, `\`, `_` and `^` need no escaping, and it renders as math on GitHub and GitLab. In mdsvex it renders as display math through a math renderer, Temml by default, with no `<pre>` or `<code>` around it; with math turned off it is an ordinary code block. Only the language `math` is math: a `latex` or `tex` fence stays an ordinary code block that shows the source. Anything after `math` in the info string is kept and reserved for later use, such as equation labels.

Inline math is a code span wrapped in dollars: a `$`, a code span and a `$`, with nothing between them, all on one line.

```markdown
Euler's identity, $`e^{i\pi} + 1 = 0`$, links five constants.
```

The code span is any code span, of one or two backticks, and a space at each end is padding as it is in one. The LaTeX is raw: nothing in it is markup, and a leading `#!` is not a language hint. It may stand anywhere a code span may, in a heading, a table cell or the text of a link, and it needs no space around it (`` a$`x`$b `` is math). In a table cell `\|` is a bar, as in any code span there, so the LaTeX double bar is written `\Vert`.

Both dollars are needed, and a `$` that is escaped does not count. Everything else is what it is without the dollars:

| source | result |
|---|---|
| `` $`x`$ `` | math |
| `` $`x` `` | a `$`, then a code span |
| `` `x`$ `` | a code span, then a `$` |
| `` \$`x`$ `` | a `$`, a code span, a `$` |
| `` $ `x`$ `` | the same, a space is not nothing |
| `$5`, `a $ b`, `$x$`, `$$x$$` | text |
| `` $$`x`$$ `` | a `$`, math, a `$` |

So prices need no escaping, and plain `$…$` and `$$…$$` are not math. A code span may run over a line end and inline math may not: a `$` before a code span that closes on a later line is a `$` and a code span. A formula too long for a line is what the fence is for. A code span with the language hint `` `#!math …` `` is not math either, it stays inline code.

In mdsvex inline math renders through the same math renderer as the fence. With math turned off it is an ordinary code span that shows the LaTeX, without the dollars.

---

_Feedback welcome._
