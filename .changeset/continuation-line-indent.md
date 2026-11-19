---
'@mdsvex/parse': patch
---

The indent of a continuation line is no longer part of its text in a list item or a block quote, as in a paragraph. `- a` followed by `  b` gives the text `b`, not `  b`, and a node that starts the line has no text node of spaces before it.
