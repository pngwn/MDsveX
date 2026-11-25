---
'@mdsvex/parse': patch
---

A line of a paragraph shows as it arrives in a stream when it starts with a character that could open a block, such as a backtick, `*`, `_`, `-`, `<`, `[`, `{`, `:` or a digit. The parser used to hold such a line until its end, so it appeared all at once. It now waits only until the line can no longer be that block: `` `a `` is a code span, since a fence takes three backticks.
