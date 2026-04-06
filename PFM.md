# Penguin-Flavoured Markdown (PFM)

A markdown variant for mdsvex. Uses CommonMark as baseline. Goals: remove ambiguity, eliminate redundant syntax, add essential missing features.

**Guiding principles:**

1. Markdown is learned, not intuitive — tweaking it doesn't break anything sacred
2. Ambiguity is bad for users and parsers
3. Invisible syntax is bad
4. Multiple ways to do the same thing is bad
5. The 80% case should be covered without extensions
6. Markdown is not a "compile to HTML" language, though that's the primary target
7. Output should degrade reasonably in standard parsers (GitHub/GitLab)
8. Strictness enables optimistic and incremental parsing — ambiguous input is a parse error, not a fallback. True streaming is not achievable with any markdown-like syntax, but stricter rules minimise required lookahead and reduce the space of possible re-interpretations. Where ambiguity remains (e.g. tables, inline delimiters), the parser can commit to the most probable interpretation based on real-world document profiling — pathological inputs that nobody actually writes don't need to be handled gracefully.

---

### Changes from CommonMark

**Indentation** — Indented code blocks removed. Fenced code blocks only. Indentation is now insignificant.

**Link references** — Shorthand references must be explicit. `[ref]` alone is ambiguous (is it a link or plain text?). Required form:

```markdown
[ref]: url

[ref][]
```

The definition must appear **before** the reference is used. Forward references are a parse error. This enables true streaming and incremental parsing.

**Headings** — Only ATX style (`#` prefix). Setext style (`===`/ `---` underlines) removed. Trailing `#` characters are treated as heading text, not syntax.

**Lists** — Non-sequential numbers supported (`11.`, `27.` etc.). Tight vs. loose is determined locally and per-list: no blank lines between items = tight (no `<p>` wrappers), all items separated by blank lines = loose (with `<p>` wrappers). Mixed blank lines are treated as loose. No cascade behaviour — a blank line in one list never affects another.

**Emphasis** — `_` for emphasis, `*` for strong. These are **distinct and non-interchangeable**. Intraword emphasis via special syntax:

```markdown
_emphasis_
_strong emphasis_
_*emphasis inside strong*_
_*strong inside emphasis*_
intraword: fan~_tas_~tic
```

**Line breaks** — Soft breaks supported as-is. Hard breaks (`<br>`) via backslash only — trailing-space syntax removed:

```markdown
hello\
world
```

**Blockquotes** — No lazy continuation. Every line inside a blockquote must be explicitly prefixed with `>`. The first line without a `>` prefix terminates the blockquote; there is no implicit inheritance of blockquote context from a previous line. This enables line-local parsing decisions without tracking open paragraphs in parent containers.

```markdown
> foo
> bar
```

-> single blockquote containing `foo\nbar`.

```markdown
> foo
> bar
```

-> blockquote containing `foo`, followed by a separate root-level paragraph `bar`.

**Superscript** — Added, via `^`:

```markdown
Coming Soon ^TM^ -> Coming Soon <sup>TM</sup>
```

**Subscript** — Added, syntax TBD, likely `~`:

```markdown
x~1~ -> x<sub>1</sub>
```

**Strikethrough** — Added via `~~`:

```markdown
~~word~~
```

**Tables** — GFM pipe tables as base, with three extensions. Whitespace alignment is insignificant; only structure matters.

Left-side headers via `||` separator:

```markdown
| || title | title 2 |
|-----------||-------|---------|
| left head || text | text 2 |
```

Right-side headers via `||` on the right:

```markdown
| title | title 2 || |
|-------|---------||--------|
| text | text 2 || head 1 |
```

Horizontal cell merging via `|>` (content of `|>` cells must be empty — a non-empty `|>` cell is a parse error). Column count must remain consistent:

```markdown
| spanning three | >   | >   |
| -------------- | --- | --- |
| text           | b   | c   |
```

Both extensions compose:

```markdown
| || spanning |> |
|-----------||-----------|---|
| left head || text | b |
```

Vertical merging (`|^`) is reserved for future use.

**Generic directives** — First-class plugin syntax covering inline, leaf block, and container block cases. Replaces the need for most ad-hoc extensions:

```markdown
:name[content] ← inline
::name[content] ← leaf block
:::name[content]
children
::: ← container block
```

Handlers are user-supplied functions keyed by name. Attribute syntax (`{key=val}` from the upstream proposal) is not viable in mdsvex since `{}` is reserved — alternative TBD.

---

_Feedback welcome._
