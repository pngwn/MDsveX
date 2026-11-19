---
'mdsvex': patch
---

`select_template` in `compile` and `compile_async` gets the file path first, as it does in the Vite plugin, so one callback works in both. The path is the `filename` option, `undefined` without one.

```js
compile(source, {
	filename: '/site/docs/intro.svx',
	templates,
	select_template: (id, metadata) => (id?.includes('/docs/') ? 'docs' : undefined),
});
```
