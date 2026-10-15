---
'@mdsvex/parse': minor
'mdsvex': minor
---

A plugin can have a `document` hook for work that needs the whole document. It runs once, after the parse, the sequential passes and every deferred task, in plugin order, and gets the root of the tree:

```js
{
	name: 'summary',
	async document(root, ctx) {
		ctx.set('headings', count_headings(root));
	},
}
```

A hook that returns a promise needs `compile_async()`, `compile()` throws a `PluginAsyncError` for one. Its writes belong to no node.
