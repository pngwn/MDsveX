---
'@mdsvex/parse': minor
'@mdsvex/render': minor
'mdsvex': minor
---

A plugin can add a text node with its own text. `prepend` and `append` take the text of a text node in place of attrs:

```js
link: {
	parse(node) {
		return () => {
			const label = node.append('html', { tag: 'span', attributes: { class: 'visually-hidden' } });
			label.append('text', ' (opens in a new tab)');
		};
	},
}
```

The text renders as text, so markup, a brace and a character reference in it come out as characters. It is a node of its own beside the text the parser sends, `text_content` reads it, and it goes when the node whose handler added it is revoked. `append('text')` without text now throws a `TypeError`, where it used to add an empty node.
