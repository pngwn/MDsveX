---
'@mdsvex/parse': minor
'@mdsvex/render': minor
'mdsvex': minor
---

Tables can have header columns and merged cells. A `||` in the delimiter row, matched by an empty `||` cell in the header row, turns the columns on its narrower side into row headers, and two `||` give headers on both sides. A cell holding only `>` merges into the cell to its left, and a cell holding only `^` merges into the cell above. Merged cells must form rectangles, and a marker that can't merge stays text.

```md
| maybe || title |>  |
|-------||-------|---|
| hello || text  | b |
|^      || more  | c |
```
