---
'@mdsvex/parse': patch
---

The parser keeps its per node bookkeeping in reused typed arrays, so parsing a document allocates less.
