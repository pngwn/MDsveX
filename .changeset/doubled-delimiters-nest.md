---
'@mdsvex/parse': patch
---

A doubled `**` or `__` opens two nested nodes before punctuation, a link, a code span or an expression, as it does before a letter. The outer pair is no longer left as literal text.

```md
**(x)**, **[a](b)**, **`code`** and __"quoted"__
```
