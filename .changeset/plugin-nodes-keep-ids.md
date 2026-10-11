---
'@mdsvex/parse': patch
---

A document parses faster when a parse plugin adds nodes with `wrap_inner`, `prepend`, `append` or `wrap_from`. The first added node used to put every later node of the document on a slower path in `TreeBuilder`. The tree is unchanged.

This holds when the parser emits straight into the builder, as `parse_markdown_svelte` and `new PFMParser(new TreeBuilder(...))` do. With an emitter of your own between the two, the builder still falls back to the slower path once a plugin adds a node.
