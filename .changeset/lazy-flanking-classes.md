---
'@mdsvex/parse': patch
---

Parsing is faster because the parser classifies the characters around a delimiter only when it checks flanking, instead of on every cursor move. This also fixes incremental parsing of a document that ends in a lone `\r`, which could parse a delimiter before it differently than a batch parse.
