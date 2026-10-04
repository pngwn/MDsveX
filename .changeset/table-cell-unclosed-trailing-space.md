---
'@mdsvex/parse': patch
---

An unclosed delimiter in a table cell, such as `^2`, `~2`, `*2`, `[2` or a lone code span backtick, stays literal text without picking up the cell's trailing whitespace.
