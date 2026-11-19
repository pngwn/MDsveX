---
'@mdsvex/parse': minor
'mdsvex': minor
---

The `children` handlers of a directive take a `'*'` key, a handler for a child of any type. It runs for every node written directly inside the directive as it opens, after the handler for the type of the child, so a plugin can act on content it did not expect where it arrives:

```js
tabs: {
	children: {
		heading(node, ctx) {
			ctx.state.tab?.close();
			ctx.state.tab = node.wrap_from('directive_container', { name: 'tab' });
		},
		'*'(node, ctx) {
			if (ctx.state.tab === undefined && node.type !== 'directive_label')
				ctx.warn('before_first_tab', 'content before the first tab is in no tab', node);
		},
	},
}
```

`ctx.index` counts its own runs, so `0` is the first child. It is not called for the blank lines between children. `descendants` has no such key and throws for one.
