---
'@mdsvex/parse': patch
---

A pipe escaped in a code span in a table cell is now a plain pipe in the code, as in GFM. Before, the backslash was part of the code and showed in the page. A backslash before any other character stays, and so does `\|` in a code span outside a table.

```md
| type               |
| ------------------ |
| `string \| number` |
```

This renders the code `string | number`. A parse plugin reads the same from `text_content`. A custom emitter gets the code as a `text` attr before the node closes, and the value range still covers the source as written.
