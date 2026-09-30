---
'@mdsvex/parse': patch
---

Incremental parsing waits for enough of the next line before deciding whether a line break ends unclosed link text, directive text or an inline HTML element, so text like `*:x[` followed by `#]` on the next line gives the same tree as a full parse.
