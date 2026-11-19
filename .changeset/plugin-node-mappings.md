---
'@mdsvex/render': patch
---

A node a parse plugin adds with `append`, `prepend` or `wrap_inner` has no place in the source, and the source map now leaves it out. A mapped render gave it a `node` record at offset 0 with a length of `0xffffffff` and an `open_syntax` record at offset 0, and the source map of a Vite build pointed it at the start of the document. The nodes `run.replace` makes keep the span of the text they replaced.
