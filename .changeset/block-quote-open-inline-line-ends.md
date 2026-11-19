---
'@mdsvex/parse': patch
---

In a block quote, emphasis, strikethrough, superscript, subscript, link or image text and inline directive text now end at the lines a paragraph ends at: a nested quote, a fence, the close of a container directive or the next item of a quoted list. The paragraph ends there, the unclosed marker is literal text and the next line is its own block.

```markdown
> *a
> > b*
```

This is a paragraph `*a` and a nested quote holding `b*`, where it was one paragraph with strong text holding `> b`.
