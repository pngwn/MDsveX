# @mdsvex/migrate

Migrate **CommonMark / GFM** markdown to **Penguin-Flavoured Markdown (PFM)**,
and mdsvex 0.x layouts, highlight options and smart punctuation to mdsvex next.

The source document is parsed with the [remark](https://github.com/remarkjs/remark)
(unified) ecosystem into an `mdast` tree, then re-serialised under PFM's rules.

## Usage

```ts
import { migrate } from "@mdsvex/migrate";

const pfm = migrate("Hello\n=====\n\nSome *emphasis* and **strength**.");
// # Hello
//
// Some _emphasis_ and *strength*.
```

### Options

```ts
migrate(source, {
	bullet: "-", // unordered list marker: "-" (default), "+" or "*"
	smartypants: true, // the 0.x smartypants option the documents were written for
	math: true, // the documents were written for remark-math
});
```

`smartypants` is off unless you pass it. See [Smart punctuation](#smart-punctuation).

`math` is off unless you pass it. See [Math](#math).

## What it changes

| CommonMark / GFM                       | PFM output                                            |
| -------------------------------------- | ----------------------------------------------------- |
| Setext headings (`===` / `---`)        | ATX headings (`#`)                                    |
| Indented code blocks                   | Fenced code blocks                                    |
| `file=./a.js` on a fence with no code  | `src=./a.js` (remark-code-import)                     |
| `*emph*` / `_emph_`                    | `_emph_` (emphasis is always `_`)                     |
| `**strong**` / `__strong__`            | `*strong*` (strong is always `*`)                     |
| Trailing-space hard breaks             | Backslash hard breaks (`\`)                           |
| Lazy blockquote continuation           | Every line explicitly prefixed with `>`               |
| Shortcut references (`[ref]`)          | Explicit collapsed references (`[ref][]`)             |
| Reference definitions                  | Hoisted to the top so they precede every use          |
| GFM tables, strikethrough, task lists  | Preserved                                             |
| GFM footnotes                          | PFM footnotes, each reference with its definition's label |

Superscript, subscript and the PFM table extensions have no CommonMark
equivalent, so nothing maps onto them; raw HTML is passed through untouched.

## Footnotes

A footnote reference and its definition are written as PFM footnotes, which
have the same form. Three things differ:

- PFM matches labels exactly, where GFM ignores case, so every reference is
  written with the label of its definition.
- A PFM label has no whitespace, bracket or caret. One that does gets a `-`
  in their place, in the reference and the definition alike.
- A PFM definition holds one paragraph. The blocks after it follow the
  definition as blocks of the document. A definition whose text starts with
  a list or a fence has no PFM form yet, so it stays literal text, as its
  references do.

A `[^...]` that was no footnote in the source is escaped, since PFM reads
every `[^label]` as a reference and fails the build for one with no
definition. A second definition of a label, which PFM rejects, is escaped
too.

## Math

PFM writes inline math as a code span in dollars and display math as a `math`
fence. Plain `$x$` and `$$x$$` are text there, so a dollar never needs
escaping. Without the `math` option a dollar in your documents stays a dollar
and the text between two of them is migrated as markdown.

Pass `math: true` for a project that used `remark-math`. The document is then
read with `remark-math`, so math is found exactly where your old build found
it, and the LaTeX is copied as written, with no markdown escaping:

| with remark-math                  | PFM output                               |
| --------------------------------- | ---------------------------------------- |
| `$e^{i\pi}$`                      | `` $`e^{i\pi}`$ ``                       |
| `$$` on a line, LaTeX, `$$`       | a ```` ```math ```` fence                |
| `$$x$$` alone in a paragraph      | a ```` ```math ```` fence                |
| `$$x$$` in a sentence             | `` $`x`$ ``                              |
| `\$5`                             | `$5`                                     |
| `$a\|b$` in a table cell          | `` $`a\Vert b`$ `` (`\|` is a cell bar)  |

`remark-math` reads `$5 and $10` as the math `5 and `. The migration leaves a
pair like that as two prices: math whose first dollar has a digit after it,
and whose closing dollar has a space before it or a digit after it, stays
text, and what is between the two dollars is migrated as markdown. Math that
starts with a digit and closes tightly, such as `$2x + 1$`, is still math.

In either mode, a code span that already had a dollar on each side
(`` \$`x`\$ ``) gets its first dollar escaped, so PFM does not read it as math.

## Legacy layouts to templates

mdsvex next replaces 0.x layouts with templates. Three helpers cover the move.

### Config

`migrate_config` rewrites the `layout` option in a JavaScript or TypeScript
config file. It finds the options passed to anything imported from `mdsvex`,
following top-level variables. A file that imports nothing from mdsvex has its
default export treated as the options.

```ts
import { migrate_config } from "@mdsvex/migrate";

const { code, notes } = migrate_config(source);
```

| mdsvex 0.x                              | mdsvex next                                     |
| --------------------------------------- | ----------------------------------------------- |
| `layout: './src/Layout.svelte'`         | `templates: { default: './src/Layout.svelte' }` |
| `layout: { _: ..., blog: ... }`             | `templates: { default: ..., blog: ... }`            |
| `layout: false`                         | removed                                         |
| folder-name matching of named layouts   | `select_template(id, metadata)`, as a note      |
| `layoutPropForwarding`                  | flagged, as templates always forward props      |

0.x applied a named layout to any document inside a folder with the same name.
Templates aren't matched by folder, so when there are named layouts the notes
include a `select_template` to paste in:

```ts
select_template: (id) => (id.includes('/blog/') ? 'blog' : undefined),
```

### Highlight options

`migrate_config` also rewrites the 0.x `highlight` option. mdsvex next
highlights with twinkleplop instead of Prism, and escapes whatever a
highlighter returns, so a few things go away.

| mdsvex 0.x                              | mdsvex next                                     |
| --------------------------------------- | ----------------------------------------------- |
| `highlight: false`                      | kept                                            |
| `highlight: { alias: { x: 'y' } }`      | `highlight: { languages: { x: 'y' } }`          |
| `highlight: { optimise }`               | removed                                         |
| `highlight: { highlighter }`            | a `// TODO(mdsvex-migrate)` comment and a note  |
| `escapeSvelte` imported from `mdsvex`   | flagged                                         |

A `highlighter` can't be rewritten safely. In next, `highlight` takes the
function itself, `(code, { lang, meta, inline, filename }) => html`. It has to
be synchronous and return plain HTML, with no `escapeSvelte` and no `{@html}`.
The comment links to the
[migration guide](https://mdsvex.com/docs#syntax-highlighting-in-0x).

An alias to a Prism language that twinkleplop doesn't have, such as `markup`,
gets a note too.

### Smart punctuation

mdsvex 0.x ran smartypants over every document unless `smartypants` was
`false`. mdsvex next has `smart_punctuation`, which is off by default.
`migrate_config` turns it on for a config that relied on the old default, and
maps the old option onto the new one.

| mdsvex 0.x                              | mdsvex next                                     |
| --------------------------------------- | ----------------------------------------------- |
| no `smartypants` option                 | `smart_punctuation: true` is added              |
| `smartypants: true`                     | `smart_punctuation: true`                       |
| `smartypants: false`                    | removed                                         |
| `smartypants: { quotes, ellipses }`     | `smart_punctuation: { quotes, ellipses }`       |
| `dashes: 'oldschool'`                   | `dashes: true`                                  |
| `dashes: 'inverted'`                    | `dashes: true`, with a note                     |
| `backticks`                             | removed, with a note unless it was `false`      |

A config that already has `smart_punctuation` is left alone.

Two things changed meaning, and both are in the documents rather than the
config. With the 0.x default, `--` was an em dash and `---` was left alone.
Now `--` is an en dash and `---` is the em dash. And 0.x curled backtick
quotes, <code>&#96;&#96;like this''</code>, which next does not read as
quotes. `migrate` rewrites both when it is given the old option, so the pages
render what they did:

```ts
migrate(source, { smartypants: true }); // the 0.x default
migrate(source, { smartypants: { dashes: "inverted", backticks: "all" } });
```

| 0.x `smartypants`             | in text                                                        |
| ----------------------------- | -------------------------------------------------------------- |
| `true`, or `dashes: true`     | `--` becomes `---`, and `---` becomes `\---` to stay literal   |
| `dashes: 'inverted'`          | `--` and `---` swap                                            |
| `dashes: 'oldschool'`, `false` | dashes are left as they are                                    |
| `backticks: true`             | <code>&#96;&#96;a''</code> becomes `"a"`                       |
| `backticks: 'all'`            | a lone backtick becomes `'` as well                            |
| `quotes: false`               | backtick quotes are written as curly quotes, nothing else would curl them |

Only text changes. Code, urls, titles, alt text and raw HTML are left as they
are. The notes from `migrate_config` say which of these apply to a config.

### Documents

`migrate_frontmatter` renames a document's frontmatter `layout` key to
`template`. `layout: false` becomes `template: false`, and `layout: _` becomes
`template: default`. `migrate` does the same while converting the markdown, and
otherwise keeps frontmatter as it is.

```ts
import { migrate_frontmatter } from "@mdsvex/migrate";

const { code, notes } = migrate_frontmatter(source);
```

If the frontmatter already has a `template` key, nothing is renamed and a note
says so.

### Template components

`check_template` flags what a layout component needs changed before it works as
a template. It rewrites nothing; `npx sv migrate svelte-5` migrates the
component as a whole.

```ts
import { check_template } from "@mdsvex/migrate";

const notes = check_template(source);
```

- `<slot />` becomes `{@render children()}`.
- `$$props`, `$$restProps` and `{...$$props}` become `$props()`.

### Notes

Every note has a `kind`, a `message`, and the 1 based `line` and `column` it
refers to. The kinds are `select_template`, `layout_prop_forwarding`, `slot`,
`legacy_props`, `template_key`, `highlighter`, `highlight_language`,
`escape_svelte`, `smart_punctuation`, and `manual` for anything that couldn't
be rewritten safely.

## Notes

- Reference **definitions are hoisted** to the top of the document, because PFM
  forbids forward references — a definition must appear before its first use.
- Migrated output is round-trip validated against [`@mdsvex/parse`](../parse) in
  the test suite to guarantee it is valid PFM.
