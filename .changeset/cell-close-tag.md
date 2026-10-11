---
'@mdsvex/parse': patch
---

A close tag in a table body cell no longer closes an element opened before the table. It is literal text, as it already was in a header cell, and the row, the table and the element carry on.

```md
<div>

| h |
|---|
| a </div> b |

d

</div>
```

Before, the div ended inside the cell, the rest of the row became a paragraph outside the table and the real `</div>` was shown as text. Now the cell holds `a </div> b` and the div closes at its own close tag.

A close tag on the line after the last row ends the table and closes the element without leaving an empty row behind. A close tag that ends the last row line, with no pipe after it, still closes the element, as it does at the end of a list item or a heading.
