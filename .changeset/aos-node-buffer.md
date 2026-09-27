---
'@mdsvex/parse': patch
'@mdsvex/render': patch
'mdsvex': patch
---

Parsing and rendering are faster because each node's fields now sit together in one typed array instead of one typed array per field.
