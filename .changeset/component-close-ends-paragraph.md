---
'@mdsvex/parse': patch
---

A closing tag of an enclosing HTML element or component on its own line now ends the paragraph or list item before it, so the line break and indentation before the tag no longer end up inside the paragraph.

```md
<Card>
  - one
  - two
</Card>
```
