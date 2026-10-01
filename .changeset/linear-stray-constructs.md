---
'@mdsvex/parse': patch
---

Parsing time stays proportional to document size when a document has unmatched braces or stray `<word` text. Incremental parsing also stays linear inside long paragraphs, tables, pending emphasis and unclosed braces, frontmatter, comments, code spans or HTML and Svelte blocks, where it used to slow down with every chunk.
