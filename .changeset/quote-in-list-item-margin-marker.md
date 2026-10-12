---
'@mdsvex/parse': patch
---

A `>` at the left margin no longer continues a block quote that sits inside a list item. The line is outside the item, so it ends the list and starts a new quote.

```md
- > inside the item
> a new quote after the list
```
