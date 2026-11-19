---
'@mdsvex/parse': minor
'mdsvex': minor
---

A plugin can start async work for a node with `ctx.defer(node, task)`, and `compile_async()` waits for it:

```js
return () =>
	ctx.defer(node, async (node, ctx) => {
		const entry = await lookup(node.text_content);
		node.attrs.label = entry.short;
		ctx.set(`entry:${entry.key}`, entry);
	});
```

- The task changes its node through the node and context it is given. Its changes apply once it finished and the node is final, in document order, and go if the parser takes the node back.
- A task may change its node and what is inside it and write data for it. Anything else is a `TypeError`.
- `compile()` throws a `PluginAsyncError` at the first `ctx.defer`, pointing to `compile_async()`. A task that fails rejects `compile_async()` with a `PluginTaskError` that names the plugin and the node.
- The Vite plugin and `?data` imports wait for deferred work. A document that defers nothing compiles as before.
