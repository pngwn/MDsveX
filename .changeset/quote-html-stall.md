---
'@mdsvex/parse': patch
---

Content after a block quote is no longer dropped when the quote's last line ends with an unclosed HTML tag and the next line has no `>`.
