---
'@mdsvex/plugin-citations': patch
---

The bibliography grows as a document streams. The `::bibliography` component reads the data of the document from the context, so a streaming view (`PluginStream` in `@mdsvex/render/stream`) shows each entry as its citation closes and its lookup lands, instead of an empty list until the stream ends. A compiled document renders the same list as before, and the component still takes a `data` prop, which wins over the context.
