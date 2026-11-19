---
'@mdsvex/parse': patch
---

Incremental parsing gives the same result as parsing the whole document when a chunk ends right after a `+` or `1.` list marker with no content yet, or inside an open tag whose attributes contain a `>`.

```md
+
x
<C b={x > 1}>y</C>
```
