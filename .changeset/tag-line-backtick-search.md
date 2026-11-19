---
'@mdsvex/parse': patch
---

A long document of lines that start at an HTML tag, with no backtick in it, parses in time that grows with its length. It grew with the square of the length: 1.5MB of table cells took over a second and now takes about 30ms.
