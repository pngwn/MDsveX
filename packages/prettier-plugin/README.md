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

The plugin tidies a document and keeps the choices its author made: list markers, numbering, table spacing and emphasis stay as they are written.

Today it:

- folds a run of blank lines between blocks to one
- takes the spaces off the end of a line of prose
- ends the document with one line end
- folds the spaces after a list marker to one, moves a nested list to the content column of its item and a list at the top to the left edge, what an item holds moves with it
- puts a space after a `>` that has text straight after it
- formats the yaml frontmatter, the imports at the top, `<script>` (TypeScript with `lang="ts"`) and `<style>` (css, scss or less)
- formats `{expressions}`, `{@html}` and `{@render}` tags, an expression in prose stays on one line
- tidies open tags: the spaces between attributes fold to one and each `{expression}`, spread and `{@attach}` is formatted on one line, the tag keeps its line breaks, quotes and the order of its attributes
- formats the heads of blocks on one line: `{#if}`, `{:else if}`, `{#key}`, `{#each}` with its binding, index and key, `{#await}`, `{:then}`, `{:catch}` and `{#snippet}` with its parameters

The formatting of the code follows your Prettier options, `singleQuote`, `semi`, `useTabs` and the rest. A part that does not parse is left as it is, so is `<pre>`, an expression over several lines in an attribute and a `{@const}` tag.

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
