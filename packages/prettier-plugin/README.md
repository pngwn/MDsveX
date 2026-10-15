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
- formats the yaml frontmatter, the imports at the top, `<script>` (TypeScript with `lang="ts"`) and `<style>` (css, scss or less)
- formats `{expressions}`, `{@html}` and `{@render}` tags and the heads of `{#if}`, `{:else if}` and `{#key}`, an expression in prose stays on one line

The formatting of the code follows your Prettier options, `singleQuote`, `semi`, `useTabs` and the rest. A part that does not parse is left as it is, so is `<pre>`, an attribute value and the head of `{#each}`, `{#await}` and `{#snippet}`.

## Code fences

Code fences are left exactly as they are, their line ranges, annotations and `[!eval]` groups count the lines of the code. Turn on `mdsvexFormatFences` to format a fence whose info string is a language Prettier knows and nothing else:

```json
{
	"plugins": ["@mdsvex/prettier-plugin"],
	"mdsvexFormatFences": true
}
```

A fence with meta (` ```js {1-3} `), an annotation (`[!hl]`) or a markdown language is still left as it is, and so is a fence inside a list or a quote.
