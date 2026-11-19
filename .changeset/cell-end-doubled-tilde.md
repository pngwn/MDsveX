---
'@mdsvex/parse': patch
---

A subscript that ends just before a doubled tilde is now read the same wherever its line ends. `~{x}~~` was a subscript in a paragraph and in a table body cell with a space before the closing pipe, but literal text in a header cell, in a body cell with no space before the pipe, and as the last thing in the document. All of them now give a subscript around the expression followed by a literal `~`. It needed something other than plain text inside the subscript: an expression, a link or an element.

A `~~` with nothing after it on its line no longer opens a strikethrough, so the end of the document and the pipe that ends a table cell behave like the end of a line. A trailing `~~` is now two text nodes of one tilde each in every position, where the end of the document and an unpadded cell gave one node of two. What it renders does not change.
