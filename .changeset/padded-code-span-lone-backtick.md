---
'@mdsvex/parse': patch
---

A single backtick in a two backtick code span that starts with a space no longer hides the character after it. A span like this with no closer now stops at the end of its table cell, at a blank line or at the end of the input, and its backticks are text.

```md
| `` a ` |
| ------ |
```

The cell holds its text as written, in header and body rows alike. A span that does close after such a backtick loses its padding spaces: ``` `` a ` `` ``` is the code ``a ` ``.
