---
'@mdsvex/parse': minor
---

Parse plugins can group a node with the siblings that follow it. `node.wrap_from(type, attrs?)` puts a new node around the node and sends every later sibling into it, until `close()` is called on the view it returns or the parent closes:

```js
const sectionize = () => {
	let open = null;
	return {
		heading: {
			parse(node) {
				if (node.parent?.type !== 'root') return;
				open?.close();
				open = node.wrap_from('html', { tag: 'section' });
			},
		},
	};
};
```

The node must be the last child of its parent, which the node in an open handler always is. `wrap_from` and `close()` throw when called from the handler of a pending node, such as an emphasis or a tight list paragraph. See `PLUGINS.md` for nesting, `wrap_inner` and revokes.
