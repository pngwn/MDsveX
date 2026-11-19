---
'@mdsvex/parse': patch
---

A tag that is never closed at the start of a line, such as a stray `<span>`, is text in one paragraph with the rest of its line, and the text after it appears once. Text on the lines after such a tag keeps its paragraphs.
