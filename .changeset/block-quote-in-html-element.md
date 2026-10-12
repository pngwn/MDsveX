---
'@mdsvex/parse': patch
---

A block quote opens inside an HTML element or a component that runs over lines, as headings, lists and fences already did. Its `>` used to be text in a paragraph.

```md
<div>
> a quote
</div>
```

The `div` holds a block quote. The quote ends at the first line with no `>`, which here is the close tag.
