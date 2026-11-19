---
'@mdsvex/parse': patch
---

A backslash at the end of a line is a hard break only when the next line carries on the same paragraph. Before a blank line, a line that starts another block, or the end of the input it is a literal backslash, and the next line is parsed as its own block. A backslash at the end of a heading or a table row is literal too.

```markdown
a\

b
```

This is two paragraphs, `a\` and `b`.
