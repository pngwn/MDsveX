---
'mdsvex': minor
---

A new `plugins` option, on `mdsvex()` and on `compile()`, takes plugins that bring their own directives: the components that render them and handlers that reshape what is written inside them.

```js
import { steps } from '@acme/steps';

mdsvex({ plugins: [steps()] });
```

```js
export function steps() {
	return {
		name: 'steps',
		// exports a component for each directive below, under its name
		module: '@acme/steps/directives',
		directives: {
			steps: {
				children: {
					heading(node, ctx) {
						ctx.state.step?.close();
						ctx.state.step = node.wrap_from('directive_container', { name: 'step' });
						node.wrap_from('directive_label').close();
					},
				},
			},
			step: {},
		},
	};
}
```

- An entry of `directives` can hold `children` (handlers for nodes written directly inside the directive), `descendants` (nodes at any depth) and `parse` (the directive itself). Each handler gets `ctx.directive`, `ctx.index` and `ctx.state`, an object that is new for each directive in the document.
- The plugin's components have the lowest precedence. A `directives` export of the same name from a `components` module or a template replaces the component, and the plugin's handlers still run.
- A plugin can also carry `parse`, a parse plugin for the whole document, and `components`, element replacements.
- In the Vite plugin a plugin's `module` resolves as an import from the Vite root would, and the editor manifest lists each plugin's directives in a new optional `plugins` field.

`parse_plugins` works as before, alone or beside `plugins`.
