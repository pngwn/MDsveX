---
'@mdsvex/parse': patch
'mdsvex': patch
---

A code span holding only `#!` or `#!lang`, with no space and code after it, renders as ordinary inline code showing that text, and never takes a language hint.

```md
Write `#!ts` or `#!` in prose.
```
