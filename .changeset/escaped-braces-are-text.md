---
'@mdsvex/render': patch
'mdsvex': patch
---

A brace escaped with a backslash renders as text, so Svelte no longer reads it as an expression. This holds in the alt text of an image too.

```md
a \{1 + 1\} b
```

renders `a {1 + 1} b`, where it used to render `a 2 b` or fail the build when the text between the braces was not JavaScript. An unescaped brace is an expression, as before.
