---
'@mdsvex/migrate': patch
---

Footnotes are kept as literal text. A reference becomes `\[\^label\]` and a definition becomes `\[\^label\]: ...` followed by the rest of its blocks, where both used to be dropped from the output.
