---
'@mdsvex/parse': patch
---

Parsing is faster because code span contents, table cell padding and code fence info strings are skipped in one scan instead of one parser step per character.
