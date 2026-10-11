---
'@mdsvex/parse': patch
---

A table header cell that starts with emphasis, a link or another inline node now keeps the whitespace after it. Before, the space was dropped and the words ran together. Body cells were not affected.

```md
| *name* of the option |
| -------------------- |
```

The header now reads "**name** of the option", it used to read "**name**of the option".
