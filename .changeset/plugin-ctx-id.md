---
'mdsvex': minor
'@mdsvex/parse': minor
---

A parse plugin that gives a node an id asks for one with `ctx.id(base)`. It returns the base, or the next free repeat of it (`-1`, `-2`), so it never takes the id of a heading, a footnote or what another plugin asked for:

```js
link: {
	parse(node, ctx) {
		return () => {
			node.attrs.id = ctx.id(node.text_content);
		};
	},
},
```

The id belongs to the node whose handler asked and is free again if that node is revoked. `ctx.id(id, { fixed: true })` keeps an id the author wrote as it is, and one an element before it already has is a `HeadingIdError`.
