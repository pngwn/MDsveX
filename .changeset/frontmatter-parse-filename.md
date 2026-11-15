---
'mdsvex': minor
'@mdsvex/parse': minor
'@mdsvex/migrate': patch
---

`frontmatter.parse` gets the path of the document as its second argument, `{ filename }`, so a value that comes from where a document lives can go into `metadata`:

```js
import { parse } from 'yaml';

mdsvex({
	frontmatter: {
		parse: (raw, { filename }) => ({
			slug: filename?.split('/').at(-2),
			...parse(raw)
		})
	}
});
```

The same parser runs for the compiled document, a `?metadata` import and `ctx.frontmatter`, so all three see the same values. `filename` is `undefined` when the document is compiled without a path. The `frontmatter` option of `parse_markdown_svelte` gets the same second argument, from its `filename` option.
