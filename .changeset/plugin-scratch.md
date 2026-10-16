---
'@mdsvex/parse': minor
'mdsvex': minor
---

A plugin keeps what it needs through a document in `ctx.scratch`. It is one object per plugin name and document, the same from every handler, close callback, handler bound to a directive, deferred task and document hook of the plugin, so the directives of a plugin can leave something for its document hook without a walk of the tree:

```js
{
	name: 'refs',
	parse: {
		document(root, ctx) {
			for (const list of ctx.scratch.lists ?? []) list.attrs.args = { ...list.attrs.args, ready: 'true' };
		},
	},
	directives: {
		references: {
			parse(node, ctx) {
				(ctx.scratch.lists ??= []).push(node);
			},
		},
	},
}
```

Anything can go in it, and it never reaches `plugin_data`. A revoke does not take a write back, so keep there what the parser never revokes, such as a block directive or a heading, and write what must follow revocation with `ctx.set` and `ctx.add`. Reading it throws for a plugin with no `name`.

`PluginContext` no longer takes keys of your own, so `ctx.section = ...` is a type error. Move such a key to `ctx.scratch`.
