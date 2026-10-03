---
'@mdsvex/render': patch
'mdsvex': patch
---

Braces in code spans, fenced code and fence info strings render as text, so Svelte no longer reads them as expressions.

```md
Use `{ a: 1 }` here.
```
