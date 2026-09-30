---
'@mdsvex/parse': patch
---

Incremental parsing waits for the character after a whole run of `#` before deciding whether a line starts a heading, so a line like `##text` that ends a chunk still continues the paragraph above, the same as in a full parse.
