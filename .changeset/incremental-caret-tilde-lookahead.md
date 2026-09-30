---
'@mdsvex/parse': patch
---

Incremental parsing waits for the character after `^` or `~~` before deciding whether it opens superscript or strikethrough, so a `^` or `~~` at the end of a line stays text, the same as in a full parse.
