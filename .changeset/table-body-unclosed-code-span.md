---
'@mdsvex/parse': patch
---

A code span with no closer in a table body cell now leaves the rest of the cell as inline content, as it already did in a header cell. Before, the rest of the cell was one text node, so emphasis in it was not parsed and a backslash escape kept its backslash.

```md
| a          |
| ---------- |
| `b *c* \*d |
```
