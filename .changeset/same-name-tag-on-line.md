---
'@mdsvex/parse': patch
---

A component that closes on the line it opens on is inline in a paragraph also when it holds a self closing tag of its own name, or its own name in a code span. Such a line used to be read as a block that runs over lines, which cut the text after the close tag off into a paragraph of its own.

```md
<Badge><Badge /></Badge> new today
```

```html
<p><Badge><Badge /></Badge> new today</p>
```
