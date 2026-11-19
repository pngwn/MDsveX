---
'@mdsvex/parse': patch
---

A backslash escape in a link destination or a link title gives the character alone, as it does in link text. It works in inline links, images and link reference definitions.

```md
[a](/u\)b "t \" u")
```

The link's `href` is `/u)b` and its `title` is `t " u`. Both used to keep the backslashes. An escaped brace (`\{`, `\}`) is a literal brace in the rendered attribute, where a bare one is a Svelte expression.
