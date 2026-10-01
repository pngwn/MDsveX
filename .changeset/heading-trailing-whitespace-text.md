---
'@mdsvex/parse': patch
---

Trailing whitespace after an inline element at the end of a heading no longer leaves an empty text node in the heading.

```md
# <b> 
```
