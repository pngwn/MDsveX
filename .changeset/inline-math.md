---
'mdsvex': minor
---

Inline math. A code span wrapped in dollars renders as math, through the same renderer as a `math` fence:

```md
Euler's identity, $`e^{i\pi} + 1 = 0`$, links five constants.
```

```html
<span class="math math-inline" translate="no"><math>...</math></span>
```

Both dollars have to touch the backticks, and the span has to end on its line. The LaTeX is raw, so braces, backslashes, `_` and `^` need no escaping. It works wherever a code span does, in a heading, a table cell or the text of a link. Plain `$x$` and `$$x$$` are still text, so a price needs no escaping.

- The Vite plugin loads Temml the first time a document has math of either kind.
- A `math` replacement gets inline math too, with the LaTeX as `code` and the rendered math as `children`, and without `display`. A `code` replacement never gets it.
- A math renderer function is called with `display: false` and an empty `meta`.
- LaTeX the renderer can't read is a `MathError` that says `inline math` and has the `line` and `column` of the place in the LaTeX.
- With `math: false`, and in `compile()` without a `math` option, it is inline code that shows the LaTeX, without the dollars.
