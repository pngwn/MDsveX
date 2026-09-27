---
'@mdsvex/parse': patch
---

Incremental parsing is faster inside code fences and script or style blocks, because a feed that cannot hold the closing fence or close tag now skips the parser entirely.
