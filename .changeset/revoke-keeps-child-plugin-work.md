---
'@mdsvex/parse': patch
---

What a plugin did to a node survives when an ancestor of that node is revoked. In `_a *b* c` the unclosed `_` is revoked and the `*b*` inside it stays, and it now keeps the attrs and nodes a plugin gave it and still fires its close callbacks.
