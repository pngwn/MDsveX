---
'@mdsvex/parse': patch
---

Outside a table a `|` gives a delimiter something to sit against and prints nothing. It now also prints nothing straight after a delimiter that never closes: `[|a` is the text `[a` and `*|` is `*`, as `x|a` is `xa`. Before, the pipe showed.

```md
[|not a link
```
