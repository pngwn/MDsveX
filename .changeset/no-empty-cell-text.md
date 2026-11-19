---
'@mdsvex/parse': patch
---

A table cell no longer ends with an empty text node when padding follows an element, a code span, a link, an expression or a directive, as in `| <b>c</b> | d |`. Rendered output was not affected, but a parse plugin saw the empty node as the last child of the cell and its `text` handler ran for it. A tree built from the wire format never had it.
