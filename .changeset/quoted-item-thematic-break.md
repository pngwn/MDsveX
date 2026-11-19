---
'@mdsvex/parse': patch
---

After a list item in a block quote that holds a thematic break, the `>` of the next line is the quote's own marker again. It was read as a nested block quote inside the item.

```md
> * ---
> - a
```

is a quote holding two lists, as the same lines are outside a quote.
