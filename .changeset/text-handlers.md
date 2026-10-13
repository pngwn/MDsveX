---
'@mdsvex/parse': minor
'mdsvex': minor
---

A plugin can rewrite text. A sequential plugin takes a `text` function, which is called for each run of text in the document and replaces a range of it with text or with a node:

```js
const emoji = {
	name: 'emoji',
	sequential: true,
	text(run) {
		for (const match of run.text.matchAll(/:([a-z0-9_+-]+):/g)) {
			const to = table[match[1]];
			if (to === undefined) continue;
			run.replace(match.index, match.index + match[0].length, 'text', to);
		}
	},
};

// the same call puts a node in, here #12 becomes a link
run.replace(start, end, 'link', { href: '/issues/12' }).append('text', '#12');
```

- A run is the text of neighbouring text nodes joined, so a match is found however the tree split the text. `run.parent` is the node that holds it.
- `run.replace(start, end, type, attrs)` takes offsets into `run.text` and, after them, what `append` takes. It returns a view of the new node. An empty range puts the node in at that point. A range that overlaps one already replaced throws a `RangeError`.
- The text around a replacement is still the author's: it is escaped, mapped and curled by smart punctuation as before.
- Code, math, urls, attribute values, expressions and raw text are never given to a text handler. Characters the author escaped, the text of an autolink, the alt text of an image and the text of a `code`, `kbd`, `samp`, `var` or `tt` element are held back unless the plugin sets `all_text: true`.
- The handler runs once the tree is complete. A `text` function on a plugin that is not sequential throws a `TypeError`, and so does a `text` that is not a function.

`mdsvex` exports the type of a run as `TextRun`.
