---
'@mdsvex/parse': minor
'mdsvex': minor
---

Parse plugin handlers learn about their document and can report back through their context. Global handlers and handlers bound to a directive both get four new members:

```js
const toc = {
	name: 'toc',
	parse: {
		sequential: true,
		heading: {
			parse(node, ctx) {
				ctx.filename; // '/src/routes/guide.svx'
				ctx.frontmatter; // { title: 'Guide' }
				const headings = (ctx.data.headings ??= []);
				const last = headings[headings.length - 1];
				if (last && node.depth > last.depth + 1) {
					ctx.warn('skipped_level', 'a heading level is skipped', node);
				}
				headings.push({ depth: node.depth, id: node.attrs.id });
			},
		},
	},
};
```

- `ctx.filename` is the `filename` option of a compile, which the Vite plugin sets to the id of the document without its query. It is `undefined` when none was given.
- `ctx.frontmatter` is the parsed frontmatter, read through the `frontmatter.parse` option the first time a handler asks for it. Every handler has it except the open handler of the frontmatter node itself.
- `ctx.warn(code, message, node?)` adds a warning to the compile, at the node when one is given.
- `ctx.data` is an object the plugin writes to. Each plugin name has its own for each document, so a plugin needs a `name` to use it.

A warning, and a write to a key of `ctx.data`, are taken back when the parser gives up on the node whose handler made them, as attribute writes are. A `push` to an array kept in `ctx.data` is not, so collect in a sequential plugin or in the close callback of a heading or a block directive.
