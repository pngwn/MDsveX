---
'@mdsvex/parse': patch
---

Nodes made by a parse plugin are flagged. `NodeBuffer.synthetic_at(index)` and `Cursor.synthetic` are true for them and false for every node the parser made.
