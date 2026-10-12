---
'@mdsvex/parse': patch
---

The title of a link reference definition written in parentheses may hold a `(` only when it is escaped, as in CommonMark. A line whose title holds a bare `(` is no definition, so it can no longer run on to a `)` on the next line and take that line with it.

```md
[r]: /u ("t"
1. a [b](/c "d")
```

The first line is a paragraph and the second a list item.
