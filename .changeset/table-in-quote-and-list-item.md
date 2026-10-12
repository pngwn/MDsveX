---
'@mdsvex/parse': patch
---

A table opens inside a block quote, and a table inside a list item keeps its body rows. A row that is indented keeps its first cell.

```md
> | a | b |
> |---|---|
> | c | d |

- | a | b |
  |---|---|
  | c | d |
```
