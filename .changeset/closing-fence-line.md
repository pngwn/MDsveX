---
'@mdsvex/parse': patch
---

A fenced code block closes only at a line of backticks with nothing but spaces or tabs after them, as in CommonMark. A line such as ` ``` b ` or ` ```js ` inside a fence is a line of code. It used to close the fence, and the text after the backticks was dropped from the output.
