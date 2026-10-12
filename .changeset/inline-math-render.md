---
'@mdsvex/render': minor
---

A `CodeHighlighter` that sets `math: true` can also render inline math, a code span wrapped in dollars. The new `inline_math(code, start)` gives the body of the span, which is written with no `<code>` around it, and a `math` replacement takes it as children with the LaTeX as `code`. A highlighter without `math`, and a render with no highlighter, writes inline math as a plain code span with the LaTeX in it.
