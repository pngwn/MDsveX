---
'@mdsvex/parse': patch
---

Unicode punctuation and symbols count as punctuation beside emphasis, strong and strikethrough delimiters, as ASCII punctuation does. Curly quotes, dashes, ellipses, guillemets and CJK punctuation no longer leave the delimiters as literal text.

```md
“*quoted*”, word—_aside_ and *重要*。
```
