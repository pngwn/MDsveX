---
'@mdsvex/parse': minor
---

Parse handlers can be bound to a directive name. `directive_handlers` on the parse options (and a third argument of `PluginDispatcher`) takes tables keyed by directive name, and an entry holds `children`, `descendants` and `parse`:

```js
const bound = {
	steps: {
		children: {
			heading(node, ctx) {
				ctx.state.step?.close();
				ctx.state.step = node.wrap_from('directive_container', { name: 'step' });
				node.wrap_from('directive_label').close();
			},
		},
	},
};

parse_markdown_svelte(source, { directive_handlers: [bound] });
```

- `children` handlers run for nodes written directly inside a container directive of that name, `descendants` handlers for nodes at any depth, and `parse` for the directive itself, of any form.
- Each gets `ctx.directive`, `ctx.index` (how many times the handler already ran in this directive) and `ctx.state`, an object that is new for each directive. A write to the state and the index a handler used are undone when the node it ran for is revoked.
- Bound handlers run before global plugins for the same node.

A block directive now gets its `args` before its `name`, so a handler that runs at the name can read them. `NodeView`, `WrapperView` and the handler types are exported from `@mdsvex/parse`.
