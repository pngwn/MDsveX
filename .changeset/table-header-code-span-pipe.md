---
'@mdsvex/parse': patch
---

An escaped pipe in a code span in a table header cell now stays in the code span. Before, the parser closed the header cell twice and never closed the root. The backslash is kept in the code span's value.

```md
| `a\|b` |
| ------ |
```
