---
'@mdsvex/parse': patch
---

Content after an unclosed `*`, `_`, `~`, `^`, `[` or HTML tag in a heading is no longer dropped. The heading ends at the line end and the next line is parsed as usual. The same holds for an unclosed `[` before a heading, list item, block quote, fence or rule, and a link can now continue across block quote lines.
