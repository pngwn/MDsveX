---
'@mdsvex/parse': minor
'mdsvex': minor
---

A directive has its name in its open handlers. The parser sends the name straight after the open, and the handlers of a `directive_container`, `directive_leaf` or `directive_inline` node now wait for it, so a global handler and a handler bound to the directive around it can both tell directives apart as they open:

```js
tabs: {
	children: {
		directive_container(node, ctx) {
			// a written out :::tab ends the tab a heading opened
			if (node.attrs.name === 'tab') ctx.state.tab?.close();
		},
	},
}
```

A block directive has its `args` there too. The args of an inline directive still follow its closing bracket, so its close callback is where they are read. A directive handler of a parse plugin in `mdsvex` runs at the open now, where it used to wait for the close to read the name.
