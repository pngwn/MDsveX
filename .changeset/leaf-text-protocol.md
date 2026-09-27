---
'@mdsvex/parse': patch
---

Parsing is faster because each complete text run now reaches the tree builder as one emitter call instead of four.
