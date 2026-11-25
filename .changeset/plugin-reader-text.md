---
'@mdsvex/parse': minor
'mdsvex': minor
---

A parse plugin can read the text of a node as the page shows it with `ctx.text(node)`. `node.text_content` is the text as written. `ctx.text` gives a character reference such as `&amp;` as its character and applies the `smart_punctuation` of the compile as the renderer does, so with the option on the apostrophe of `## Let's go` is the curly one the page shows.

```js
const plugin = {
	name: 'headings',
	heading: {
		parse(node, ctx) {
			return () => ctx.add('headings', ctx.text(node));
		},
	},
};
```
