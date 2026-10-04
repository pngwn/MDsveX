---
'@mdsvex/parse': patch
---

Emphasis, strong, strikethrough, superscript and subscript close right after a Svelte expression, tag or code span, so `*{name}*` and `` _`code`_ `` are no longer left as literal delimiters.
