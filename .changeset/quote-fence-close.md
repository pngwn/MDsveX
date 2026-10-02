---
'@mdsvex/parse': patch
---

A fenced code block inside a block quote closes on a quoted closing line (`` > ``` ``) instead of running to the end of the document. Its value is the raw source of the content lines, so every line keeps its `>` markers.
