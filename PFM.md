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

**Indentation**, Indented code blocks removed. Fenced code blocks only. Indentation is now insignificant.

**Link references**, Shorthand references must be explicit. `[ref]` alone is ambiguous (is it a link or plain text?). Required form:

```markdown
[ref]: url

[ref][]
```

The definition must appear **before** the reference is used. Forward references are a parse error. This enables true streaming and incremental parsing.

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
:::name[content]
children
::: ← container block
```

Handlers are user-supplied functions keyed by name. The `[content]` brackets are required for every directive form — empty text is explicit (`:name[]`, `::name[]`), a bare `::name` is just a paragraph. Names start with a letter, then `[a-zA-Z0-9_-]`.

Directive text accepts simple inline constructs — emphasis, strong, code spans, strikethrough, superscript, subscript, escapes — but not links, images, or autolinks; those stay literal text. Unescaped square brackets inside the text must balance. Directives may nest: `:outer[has :inner[x] inside]`. In the leaf and container forms the brackets are matched first, with brackets inside a code span left out, and nothing in the text reaches past the closing `]`: `::name[*a](k=v)` keeps `*a` literal.

An optional argument list may follow the brackets immediately (no space). Arguments are named only — no positional values:

```markdown
:name[] ← empty text is explicit
:name[text] ← args are optional
:name[text](arg_one=val_one, arg_two=val_two) ← key=value pairs, comma separated
:name[text]() ← empty args are allowed but ignored
```

Keys start with a letter or underscore, then `[a-zA-Z0-9_-]`. Values are bare (no whitespace, commas, parens, quotes, or backslashes) or single/double quoted (backslash escapes the delimiter; values are kept raw). Spaces and tabs are allowed around `=` and `,`. Duplicate keys, trailing commas, empty values, and newlines make the list malformed: an inline directive then closes at `]` and the `(...)` stays literal text, a block directive line falls back to a paragraph. Attribute syntax (`{key=val}` from the upstream proposal) is not viable in mdsvex since `{}` is reserved — the parenthesised argument list above replaces it.

**Math**, Planned, not implemented yet. Display math is a fenced code block with the language `math`. Inline math is a code span wrapped in dollars:

````markdown
```math
\int_0^\infty e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}
```

Euler's identity, $`e^{i\pi} + 1 = 0`$, links five constants.
````

Both forms keep the LaTeX raw, so `{}`, `\`, `_` and `^` need no escaping, and both render as math on GitHub and GitLab. A `$` that is not followed by a backtick is plain text, so prices need no escaping. Plain `$…$` and `$$…$$` are not math. A `latex` fence stays an ordinary code block that shows the source.

---

_Feedback welcome._
