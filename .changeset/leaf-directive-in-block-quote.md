---
'@mdsvex/parse': patch
---

The line after a leaf directive in a block quote or a list item is read as the line after any other block there. A quoted line no longer opens a nested block quote, and an unmarked or unindented line ends the quote or the list instead of joining it.
