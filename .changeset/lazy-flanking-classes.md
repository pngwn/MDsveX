---
'@mdsvex/parse': patch
---

Parsing is faster because the parser classifies the characters around a delimiter only when it checks flanking, instead of on every cursor move.
