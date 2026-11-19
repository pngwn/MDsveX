---
'@mdsvex/parse': patch
---

An open tag split over lines in a block quote or a list item reads its attributes past the `>` marker and the indent of each line. The marker of the second line used to pass for the bracket that closes the tag.

```md
> a <b
> id="u">x</b> y
```

The element has its `id`. A blank line, or a line that leaves the quote or the list item, now ends an open tag, so text such as `a <b` can no longer take in the paragraphs after it. A blank line inside an attribute expression is still part of the expression.
