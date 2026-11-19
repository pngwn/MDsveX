---
'@mdsvex/parse': patch
---

An escaped pipe in a code span in a table body cell now stays in the code span, as it does in a header cell. Before, the cell ended at the pipe, the backtick became text and the rest of the row moved one column to the right.

```md
| a      |
| ------ |
| `b\|c` |
```
