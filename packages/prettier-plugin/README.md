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

Code fences, frontmatter, `<script>`, `<style>`, `<pre>`, expressions and attribute values are left exactly as they are.
