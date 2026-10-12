---
'@mdsvex/parse': patch
---

The indent of a continuation line is not code when a code span runs over it, as it is not text outside one. This holds in a paragraph, a list item and a block quote.

```md
- x `a
  b`
```

The code is `a`, a line end and `b`. It used to keep the two spaces that put the line inside the item.
