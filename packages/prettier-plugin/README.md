# @mdsvex/prettier-plugin

A [Prettier](https://prettier.io) plugin for mdsvex documents (`.svx`, `.pfm`).

```bash
pnpm add --save-dev prettier @mdsvex/prettier-plugin@next
```

```json
// .prettierrc
{
	"plugins": ["@mdsvex/prettier-plugin"]
}
```

Prettier picks the plugin for `.svx` and `.pfm` files from their extension, no `overrides` are needed.

## What it formats

The plugin formats the Svelte in a document as [prettier-plugin-svelte](https://github.com/sveltejs/prettier-plugin-svelte) formats a component, and the markdown around it:

- a tag that does not fit on a line puts its attributes one to a line, values go in double quotes, a lone expression is unquoted and `name={name}` becomes `{name}`
- the children of an element, a component and a block such as `{#if}` or `{#each}` are indented, markdown included
- markdown as Prettier formats it: `-` bullets, ordered lists counted from their start, `#` headings, `---` breaks, backtick fences, a blank line between blocks and one space between words
- a list item lines up with its content, a nested list sits at the content column of its item, and every line of a quote starts with `> `
- frontmatter is formatted as yaml, imports, `<script>` and `<style>` as code
- expressions, `{@html}`, `{@render}` and `{@const}` tags and the heads of blocks are formatted, an expression or a tag in prose stays on its line
- blank lines between blocks fold to one and lines lose the spaces at their ends

The formatting follows your Prettier options, `useTabs`, `singleQuote`, `bracketSameLine`, `singleAttributePerLine` and the rest. Emphasis stays as PFM writes it, `_` for emphasis and `*` for strong, and so does table spacing. A part that does not parse is left as it is, so is the content of a `<pre>` and a `{@debug}` tag.

## Frontmatter

Frontmatter is formatted as yaml, unless your project parses it itself with the `frontmatter.parse` option of mdsvex. The plugin finds that out from the manifest the mdsvex vite plugin writes to `node_modules/.mdsvex/manifest.json`, looking up from each document as the language server does.

A project that runs Prettier before vite has written the manifest, in CI say, can set it with `mdsvexFrontmatter`:

| value    | frontmatter                                                       |
| -------- | ----------------------------------------------------------------- |
| `"auto"` | formatted as yaml unless the manifest says otherwise, the default |
| `"yaml"` | always formatted as yaml                                          |
| `"keep"` | kept as written                                                   |

Frontmatter that does not parse as yaml is kept as written either way.

## Leaving parts alone

A `<!-- prettier-ignore -->` comment keeps the block after it as it is written, or the next node when the comment sits in a paragraph or a list item:

```md
<!-- prettier-ignore -->
{items.map((item)=>item.name)}

text <!-- prettier-ignore --> {a+b} and more
```

Everything between `<!-- prettier-ignore-start -->` and `<!-- prettier-ignore-end -->` at the top level of a document is kept as it is written.

`<!-- @format -->` or `<!-- @prettier -->` at the top of a document, or straight after its frontmatter, marks it for `--require-pragma`, and `--insert-pragma` writes `<!-- @format -->` there. `<!-- @noformat -->` leaves a document alone with `--check-ignore-pragma`.

## Code fences

Code fences are left exactly as they are, their line ranges, annotations and `[!eval]` groups count the lines of the code. Turn on `mdsvexFormatFences` to format a fence whose info string is a language Prettier knows and nothing else:

```json
{
	"plugins": ["@mdsvex/prettier-plugin"],
	"mdsvexFormatFences": true
}
```

A fence with meta (` ```js {1-3} `), an annotation (`[!hl]`) or a markdown language is still left as it is, and so is a fence inside a list or a quote.
