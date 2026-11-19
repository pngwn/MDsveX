---
'mdsvex': minor
---

A document imported with `?metadata` gives its frontmatter without its component. Use it to list posts, so the list does not load every page:

```js
const posts = import.meta.glob('./*/+page.svx', {
	query: '?metadata',
	import: 'metadata',
	eager: true,
});
```

```js
import { metadata } from './article.svx?metadata';
```

The module exports the same `metadata` as the compiled document, also as its default export, and `frontmatter.parse` applies. A document without frontmatter exports `undefined`. In dev, editing the frontmatter updates whatever imported it, and an edit below the frontmatter does not. For TypeScript, add `mdsvex/globals` to `compilerOptions.types` to type direct imports.
