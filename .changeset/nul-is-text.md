---
'@mdsvex/parse': patch
---

A NUL character in a document is ordinary text, and the rest of the document parses as it would without it. It used to stop the parse there, so everything after it was missing from the output.
