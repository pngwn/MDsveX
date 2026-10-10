---
'@mdsvex/parse': minor
---

Parse plugins can group a node with the siblings that follow it. `node.wrap_from(type, attrs?)` puts a new node around the node and sends every later sibling into it, until `close()` is called on the view it returns or the parent closes:

```js
const sectionize = {
	heading: {
		parse(node, ctx) {
			if (node.parent?.type !== 'root') return;
			ctx.section?.close();
			ctx.section = node.wrap_from('html', { tag: 'section' });
		},
	},
};
```

Keep the open wrapper on `ctx`, which is new for each document. The node must be the last child of its parent, which the node in an open handler always is. Both methods throw when called from the handler of a pending node, such as an emphasis or a tight list paragraph.
