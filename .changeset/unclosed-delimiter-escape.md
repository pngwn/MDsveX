---
'@mdsvex/parse': patch
---

A backslash escape written straight after a delimiter that never closes (`[`, `![`, `*`, `_`, `~`, `~~`, `^` or `:name[`) no longer shows its backslash. `[\*a` is the text `[*a`, as `x \*a` is `x *a`. This holds in paragraphs, headings, list items, block quotes and table cells. An escaped `&` there also keeps a character reference as written: `[\&amp;` is the text `[&amp;`. Trees built over the wire were already right.

```md
[\*not a link

| a      |
| ------ |
| [\*b   |
```
