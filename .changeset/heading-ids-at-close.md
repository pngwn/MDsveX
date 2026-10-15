---
'mdsvex': minor
'@mdsvex/parse': minor
'@mdsvex/render': patch
---

`heading_ids` makes each id as its heading closes, in place of a pass after the parse. The ids are the ones it made before, and a parse plugin reads them in the function its heading handler returns, so it no longer has to be `sequential` for that:

```js
const anchors = {
	heading: {
		parse(node) {
			return () => node.prepend('link', { href: `#${node.attrs.id}` });
		},
	},
};
```

A plugin that changes the text of a heading in that function changes its id when it comes before the first plugin that reads `node.attrs`.

An id is made from the ids before it and never changes once given. An id the document fixes, typed on a heading written as HTML or set on a heading by a plugin, is kept, and one that an element before it already has is now a `HeadingIdError` (code `id_taken`) naming both, where a made id used to move aside. A footnote is numbered at the end, so one whose id a heading took moves aside instead: `## Fn 1` keeps `fn-1` and the footnote `[^1]` gets `fn-1-1`.

A document that streams gets the same ids as its headings arrive. `make_heading_ids()` from `mdsvex/compile`, given a slug or not, goes to the builder:

```js
const builder = new WireTreeBuilder();
builder.set_headings(make_heading_ids());
```

`@mdsvex/parse` exports `HeadingIds`, `HeadingIdError` and `heading_slug`, and both builders take `set_headings`.
