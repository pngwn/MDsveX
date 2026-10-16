---
'@mdsvex/prettier-plugin': minor
---

New package: a Prettier plugin for mdsvex documents. It formats `.svx` and `.pfm` files and keeps the markdown as its author wrote it, list markers, numbering, table spacing and emphasis stay.

```json
{
	"plugins": ["@mdsvex/prettier-plugin"]
}
```

- Blank lines between blocks fold to one, spaces at the ends of prose lines go, the spaces after a list marker fold to one, nested lists move to the content column of their item and a `>` gets a space before its text.
- Frontmatter is formatted as yaml, imports, `<script>` and `<style>` as code, and expressions, attribute expressions, `{@html}`, `{@render}`, `{@const}` and the heads of blocks on one line. A part that does not parse is kept as written.
- Code fences are kept as written, `mdsvexFormatFences` formats one whose info string is only a language Prettier knows.
- Frontmatter a project parses itself with `frontmatter.parse` is kept, found from the manifest the vite plugin writes, and `mdsvexFrontmatter` sets it by hand.
- `<!-- prettier-ignore -->`, `<!-- prettier-ignore-start -->` and `<!-- prettier-ignore-end -->` keep what they mark, and `<!-- @format -->` works with `--require-pragma` and `--insert-pragma`.
