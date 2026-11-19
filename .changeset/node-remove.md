---
'@mdsvex/parse': minor
'mdsvex': minor
---

A plugin can remove a node. `node.remove()` takes a node and everything it holds out of the tree:

```js
// comments do not reach the page
html_comment: {
	parse(node) {
		return () => node.remove();
	},
}
```

Nothing undoes a removal, so it is allowed only where no revoke can ask for the node back, and throws anywhere else:

- from a close callback, once the node it runs for closed for good, which is when `node.pending` is `false`;
- from a sequential pass, in a handler or a close callback;
- for the node the handler runs for, or a node inside it.

An open handler of the fused pass cannot remove a node, since the parser has more to send for it.
