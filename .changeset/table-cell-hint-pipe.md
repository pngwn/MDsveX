---
'@mdsvex/parse': patch
---

A pipe in the `#!` hint of a code span in a table body cell now ends the cell, as it does in a header cell. Before, the pipe became part of the hint and the row lost a cell. An escaped pipe still stays in the hint.

```md
| a   | b    |
| --- | ---- |
| `#!a|b c` |
```
