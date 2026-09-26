---
'@mdsvex/parse': patch
---

An unclosed `*`, `_`, `~~`, `~` or `^` followed by a line that starts a list item, blockquote, fence or HTML block stays literal text, and the rest of the document parses in full.

```md
1. ~1
2. *
```
