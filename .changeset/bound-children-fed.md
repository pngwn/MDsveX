---
'@mdsvex/parse': patch
---

A `children` handler of a directive, `'*'` included, runs for an element alone on its line however the document is parsed. Fed in pieces, such an element opens inside a paragraph that is taken away when the line ends, and the handler used to miss it, so a plugin saw one set of children for a whole document and another for a streamed one.

```js
const plugin = {
	box: {
		children: {
			html: (node, ctx) => {
				node.attrs['data-index'] = ctx.index;
			},
		},
	},
};
```

```md
:::box
<Widget />

text
:::
```

`<Widget />` gets its index in both. The handler also runs now for each of several elements on lines of their own with no blank line between them, which a whole parse missed as well.
