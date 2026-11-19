---
'mdsvex': minor
---

A document exports what its plugins left in `ctx.data` as `plugin_data`, beside `metadata`, keyed by plugin name. A template gets the same object as its `plugin_data` prop, and the document can read it in its own markup.

```js
import Article, { metadata, plugin_data } from './article.svx';

plugin_data.toc.headings; // [{ depth: 2, text: 'Install', id: 'install' }]
```

- A document whose plugins left nothing has no such export and compiles as it did.
- The values are JSON: plain objects, arrays, strings, finite numbers, booleans and `null`. Anything else fails the compile with a `PluginDataError` that names the plugin and the path of the value. A key that holds `undefined` is left out.
- A frontmatter key named `plugin_data` is an error when the document has a template and its plugins left data.
- `PluginData` is an interface, so a plugin types its own key by declaration merging:

```ts
declare module 'mdsvex' {
	interface PluginData {
		toc: { headings: { depth: number; text: string; id?: string }[] };
	}
}
```
