---
'@mdsvex/parse': patch
---

A `wrap_inner` called from a plugin's close callback on a node that is still open, such as the parent, takes that node's later children. They used to land beside the wrapper.
