---
'@mdsvex/parse': patch
---

A heading or table cell streamed over the wire keeps all of its text when it ends in a space. `# a\*b ` fed in chunks now arrives as `a*b`, it used to arrive as `*b`.
