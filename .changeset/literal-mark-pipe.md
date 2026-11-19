---
'@mdsvex/parse': patch
---

A `|` next to a `_`, `*` or `~` that stays literal text is text too. It is the intraword marker, and not rendered, only directly before a mark that opens and directly after one that closes.

```md
x |* y
a_|b
fan|_tas tic
```

rendered `x * y`, `a_b` and `fan_tas tic` and now renders as written. `fan|_tas_|tic` is still `fan<em>tas</em>tic`.

For a plugin, a node opened after a marker pipe starts at the pipe.
