# @mdsvex/migrate

Migrate **CommonMark / GFM** markdown to **Penguin-Flavoured Markdown (PFM)**,
and mdsvex 0.x layouts and highlight options to mdsvex next.

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
});
```

## What it changes

| CommonMark / GFM                       | PFM output                                            |
| -------------------------------------- | ----------------------------------------------------- |
| Setext headings (`===` / `---`)        | ATX headings (`#`)                                    |
| Indented code blocks                   | Fenced code blocks                                    |
| `*emph*` / `_emph_`                    | `_emph_` (emphasis is always `_`)                     |
| `**strong**` / `__strong__`            | `*strong*` (strong is always `*`)                     |
| Trailing-space hard breaks             | Backslash hard breaks (`\`)                           |
| Lazy blockquote continuation           | Every line explicitly prefixed with `>`               |
| Shortcut references (`[ref]`)          | Explicit collapsed references (`[ref][]`)             |
| Reference definitions                  | Hoisted to the top so they precede every use          |
| GFM tables, strikethrough, task lists  | Preserved                                             |

Superscript, subscript and the PFM table extensions have no CommonMark
equivalent, so nothing maps onto them; raw HTML is passed through untouched.

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
`escape_svelte`, and `manual` for anything that couldn't be rewritten safely.

## Notes

- Reference **definitions are hoisted** to the top of the document, because PFM
  forbids forward references — a definition must appear before its first use.
- Migrated output is round-trip validated against [`@mdsvex/parse`](../parse) in
  the test suite to guarantee it is valid PFM.
