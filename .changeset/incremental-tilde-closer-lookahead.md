---
'@mdsvex/parse': patch
---

Incremental parsing waits for the character after a closing `~` or `~~` before closing subscript or strikethrough, so text like `~a~~` or `~~~~a` gives the same tree as a full parse.
