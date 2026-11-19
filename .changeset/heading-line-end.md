---
'@mdsvex/parse': patch
---

A tag, a comment or a Svelte expression in a heading ends on the heading's line, as it does in a table row. One that is still open at the end of the line is literal text, and the next line is a block of its own.

```md
# a <!--
--> b
```

The heading is `a <!--` and `--> b` is a paragraph. They used to be one heading over two lines.
