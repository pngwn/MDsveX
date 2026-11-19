---
'@mdsvex/parse': patch
---

A `|` outside a table is now rendered. Before, every pipe in a paragraph, heading, list item, block quote or inside emphasis was dropped from the output.

```md
one | two | three
```

rendered `<p>one  two  three</p>` and now renders `<p>one | two | three</p>`.

The pipe is still the intraword emphasis marker, which is not rendered, when it sits directly before or after a `_`, `*` or `~`, as in `fan|_tas_|tic`. Tables, escaped pipes and the extended table markers are unchanged.
