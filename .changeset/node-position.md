---
'@mdsvex/parse': minor
'mdsvex': minor
---

A node view says where its node is in the source, so a plugin can point at it.

```js
heading: {
	parse(node) {
		return () => {
			node.position;
			// { start: { offset: 12, line: 4, column: 0 }, end: { offset: 20, line: 4, column: 8 } }
		};
	},
}
```

Lines count from 1 and columns from 0. `end` is `undefined` while the node is open, and `position` is `undefined` for a node a plugin made and for a tree built from the wire format, which carries no offsets.
