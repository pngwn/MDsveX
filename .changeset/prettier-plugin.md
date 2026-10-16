---
'@mdsvex/prettier-plugin': minor
---

New package: a Prettier plugin for mdsvex documents. It formats `.svx` and `.pfm` files, the Svelte in them as prettier-plugin-svelte formats a component and the markdown around it.

```json
{
	"plugins": ["@mdsvex/prettier-plugin"]
}
```

- A tag that does not fit on a line puts its attributes one to a line, and the children of elements, components and blocks such as `{#if}` are indented, markdown included.
- The markdown is formatted as Prettier formats markdown, `-` bullets, ordered lists counted from their start and a blank line between blocks, with emphasis kept as PFM writes it.
- Frontmatter is formatted as yaml, imports, `<script>` and `<style>` as code, and expressions, attribute expressions, `{@html}`, `{@render}`, `{@const}` and the heads of blocks on one line. A part that does not parse is kept as written.
- Code fences are kept as written, `mdsvexFormatFences` formats one whose info string is only a language Prettier knows.
- Frontmatter a project parses itself with `frontmatter.parse` is kept, found from the manifest the vite plugin writes, and `mdsvexFrontmatter` sets it by hand.
- `<!-- prettier-ignore -->`, `<!-- prettier-ignore-start -->` and `<!-- prettier-ignore-end -->` keep what they mark, and `<!-- @format -->` works with `--require-pragma` and `--insert-pragma`.
