---
'@mdsvex/parse': patch
---

A close tag whose `>` stands on the next line closes its element, as an open tag split over lines already opens one. This is how prettier writes an inline element when it may not add a space.

```md
From <a href="/projects"
  >the projects page</a
>. More text.
```

The paragraph holds the link and the text `. More text.`. The `>` line used to start a block quote, and the link was left as literal text.
