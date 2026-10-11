---
'@mdsvex/parse': patch
---

A closing tag in a table header cell no longer closes an HTML element opened before the table. It only matches an element opened in the same cell, and is literal text otherwise. Before, the parser closed the header cell twice and never closed the root. A closing tag in a body row still closes the table and then the element.

```md
<div>

| a </div> b |
| ---------- |

</div>
```
