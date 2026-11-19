---
'@mdsvex/parse': minor
---

A code span wrapped in dollars is inline math: a `$`, a code span and a `$` with nothing between them, on one line.

```md
Euler's identity, $`e^{i\pi} + 1 = 0`$, links five constants.
```

It is a `code_span` node whose `extra` is `1`. It starts at the first dollar and ends after the last, and its value is the LaTeX, raw: a `#!` at its start is no language hint. Anything that does not read the flag shows the LaTeX as inline code.

A `$` that does not complete the form is text, as it was, so `$5`, `$x$`, `` $`x` `` and `` \$`x`$ `` hold no math. A code span that runs over a line end is not math either.

For a parse plugin, `node.math` is `true` on such a span and `false` on any other code span. Over the wire the flag is the `extra` of the open op.
