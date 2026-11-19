---
'@mdsvex/parse': minor
'mdsvex': minor
'@mdsvex/plugin-toc': patch
'@mdsvex/plugin-page-data': patch
---

Plugins write their data with `ctx.set(key, value)` and `ctx.add(key, value)`, and `ctx.data` is read-only:

```js
heading: {
	parse(node, ctx) {
		return () => ctx.add('headings', { depth: node.depth, text: node.text_content });
	},
}
```

- Every write belongs to the node whose handler made it, and a revoke takes back exactly that node's writes, whatever they were.
- `add` keeps a list in document order, whatever order the handlers ran in. Of two nodes that `set` one key, the later one in the document wins. Writes from a sequential pass come after the rest.
- A value is checked when it is written: one JSON cannot hold throws a `PluginDataError` with the plugin, the key, the path of the value and where the node is. It is copied and frozen.
- Assigning to `ctx.data` throws a `TypeError` that names `ctx.set`.
- `PluginDispatcher.on_data(listener)` follows each change to the data, a write or a revoke, with the value of the key after it.

`@mdsvex/plugin-toc` and `@mdsvex/plugin-page-data` write with the new calls, with their output unchanged.
