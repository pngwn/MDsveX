---
'@mdsvex/parse': patch
---

`heading_ids` skips scanning the node buffer for explicit HTML heading `id` attributes and footnotes when none entered the buffer, checks lazy HTML attribute spans before slicing them, and slugifies ASCII heading text through a byte table instead of regex passes. Compiles with `heading_ids: true` are about 6% faster on average across micro and real documents, with the largest gains on short documents. Output is unchanged.
