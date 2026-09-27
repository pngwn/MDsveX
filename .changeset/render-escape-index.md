---
'@mdsvex/render': patch
'@mdsvex/parse': patch
---

HTML rendering is faster because text is checked for characters to escape with forward-moving source positions instead of a regex per node, and line breaks, table cells and mapping offsets skip needless work.
