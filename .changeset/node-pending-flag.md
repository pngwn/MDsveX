---
'@mdsvex/parse': minor
'mdsvex': minor
---

A node view has `pending`, which is `true` while the parser may still revoke the node: an emphasis before its closer, a link before its destination, the paragraph of a list that can still be tight. `wrap_from` and `close()` throw exactly when the node whose handler is running is pending, so a plugin can now ask first:

```js
link: {
	parse(node) {
		return () => {
			if (!node.pending) node.wrap_from('html', { tag: 'span' }).close();
		};
	},
}
```

In the close callback of a node that closed for good it is `false`, and `wrap_from` and `close()` are allowed there, where they used to throw for a link or an emphasis that had closed.
