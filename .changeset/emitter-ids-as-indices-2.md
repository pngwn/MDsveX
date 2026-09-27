---
'@mdsvex/parse': patch
---

Parsing allocates less because node ids now double as tree indices and the parser keeps its per-node state in a reused typed array.
