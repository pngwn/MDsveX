---
'@mdsvex/parse': patch
---

A link reference definition keeps working when the line after it starts like a title but goes on with text, as in CommonMark. The definition has no title and the line is a paragraph. The whole definition used to be dropped, so every link that used it was plain text.

```md
[foo]: /url
"title" ok

[x][foo]
```

`[x][foo]` is now a link to `/url`, and `"title" ok` is a paragraph.
