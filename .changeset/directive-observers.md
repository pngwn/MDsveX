---
'@mdsvex/parse': minor
'mdsvex': minor
---

A plugin can observe a directive another plugin owns. `observe` on a parse plugin, or on the `parse` of a plugin, takes entries by directive name as a plugin's own `directives` do, with `parse`, `children` and `descendants`:

```js
const numbering = {
	name: 'numbering',
	observe: {
		figure: {
			parse(figure, ctx) {
				const number = (ctx.scratch.figures = (ctx.scratch.figures ?? 0) + 1);
				return () => ctx.set('target:' + figure.attrs.args.id, { number });
			},
		},
	},
};
```

An observer runs after the owner's handlers, at the open and at the close, whoever owns the name or renders the directive, in the fused pass. It writes plugin data, warns, takes ids, uses its scratch and defers, and changes no node: a write to one, from its handlers, its close callbacks or a task it deferred, throws a `TypeError` that names the directive and its owner.

A directive has one owner. Two plugins that bind the same directive name throw a `DirectiveOwnerError` with `directive` and both plugin names at setup, where the later one used to take the name silently, and so do two `directive_handlers` tables in the parse package.
