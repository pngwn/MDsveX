---
'@mdsvex/parse': patch
---

A delimiter (`*`, `**`, `_`, `~`, `~~` or `^`) with no text between it and the end of its table cell is now literal text. Before, the parser logged "Infinite loop detected", never closed the row and dropped the rest of the document.

```md
| a   |
| --- |
| *   |
```
