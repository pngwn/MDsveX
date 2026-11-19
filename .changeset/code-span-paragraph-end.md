---
'@mdsvex/parse': patch
---

A code span ends where its paragraph ends outside a block quote too: at a heading, a thematic break, a fence, a list item, a block level tag, a svelte block boundary, a block directive or the close of a container directive. Its backticks are then literal text, as an unclosed `*` or `[` already is.

```md
x `a
# b`
```

is a paragraph and a heading, where it was one paragraph holding a code span over both lines. A heading no longer takes the line after it into a code span it left open.
