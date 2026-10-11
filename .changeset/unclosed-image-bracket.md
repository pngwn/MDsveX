---
'@mdsvex/parse': patch
---

An image opener with nothing after it keeps its bracket. `![` at the end of a paragraph or a table cell rendered `!`, and `![]` rendered `!]`.

```md
An unfinished image ![
```
