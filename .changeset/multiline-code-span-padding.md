---
'@mdsvex/parse': patch
---

A code span padded with a space on each side loses that padding when it runs over a line, as it does on one line. `` ` a `` followed by `` b ` `` holds the code `a`, a line end and `b`, in and out of a block quote.
