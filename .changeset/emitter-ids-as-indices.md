---
'@mdsvex/parse': patch
---

Parsing is faster because node ids now double as node buffer indices, so the tree builder and parser no longer keep per-node lookup arrays.
