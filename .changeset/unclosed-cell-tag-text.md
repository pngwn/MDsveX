---
'@mdsvex/parse': patch
---

An HTML tag that is never closed keeps its whole text when it ends a table cell. `| <span>|` in a body row left only the `<` in the cell. A document built from the wire format lost the rest of the tag for any unclosed tag in a cell, so `| <span>a |` came out as `<a`.
