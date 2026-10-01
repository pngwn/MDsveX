---
'@mdsvex/parse': patch
---

Documents keep everything after a paragraph with more than a hundred or so unmatched `*`, `_`, `[`, `~~` or inline HTML tags, and after an unclosed `[` inside a table, instead of ending early.

```md
||
-
[
d
```
