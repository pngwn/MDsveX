---
'@mdsvex/parse': patch
---

An HTML element opens inside a block quote and a list item and holds blocks there, as it does at the top of a document. A line that leaves the quote or the item ends an element that was left open.

```md
> <div>
>
> # a heading in the div
>
> </div>

- <details>
  text
  </details>
```
