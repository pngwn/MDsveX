---
'@mdsvex/migrate': minor
---

`migrate` takes `math: true` for a project that used `remark-math`. The document is read as `remark-math` read it, `$x$` is written as inline math and `$$x$$` as a `math` fence, and the LaTeX is copied as it is, where it used to be escaped as markdown.

```js
migrate('Euler: $e^{i\\pi} + 1 = 0$\n\n$$\n\\frac{a}{b}\n$$', { math: true });
```

````md
Euler: $`e^{i\pi} + 1 = 0`$

```math
\frac{a}{b}
```
````

Two prices are left alone: `it costs $5 and $10` comes out as written, though `remark-math` reads `5 and ` as math there. Without the option a dollar stays a dollar. In both modes a code span that had a dollar on each side gets its first dollar escaped, so it does not turn into math.
