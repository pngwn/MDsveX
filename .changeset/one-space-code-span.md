---
'@mdsvex/parse': patch
---

Backticks around one space are a code span holding that space, as two spaces already were. `` a ` ` b `` used to leave both backticks as text, and a later backtick on the line closed the span instead.
