---
'vscode-pfm': minor
---

Inline math, a code span wrapped in dollars such as `` $`x^2`$ ``, is highlighted as math. The editor compiles it as the Vite plugin does, so with Temml LaTeX that can't be rendered is reported at its place and the rest of the document keeps working.
