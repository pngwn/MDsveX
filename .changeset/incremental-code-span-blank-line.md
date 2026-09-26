---
'@mdsvex/parse': patch
---

Incremental parsing now ends an unclosed code span at a blank line, like a full parse does, even when a chunk ends right after the line break before it.
