---
'@mdsvex/parse': patch
---

Incremental parsing is faster, because each feed builds the source window as a flat string and most line-boundary checks settle on the first character of the next line.
