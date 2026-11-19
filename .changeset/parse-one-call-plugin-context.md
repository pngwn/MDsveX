---
'@mdsvex/parse': minor
---

`parse_markdown_svelte` tells plugin handlers about the document and returns what they left. It takes a `filename` and a `frontmatter` option, the parser `ctx.frontmatter` is read through, and its result has `warnings` and `data`.

```js
const { nodes, warnings, data } = parse_markdown_svelte(source, {
	plugins: [toc],
	filename: '/docs/intro.svx',
	frontmatter: (text) => yaml.parse(text),
});
```

The types of the plugin context are exported from the package root: `PluginWarning`, `PluginData`, `PluginDocument`, `DocumentContext`, `NamedDirectiveHandlers`, `DirectiveTable`, `Position` and `Point`.
