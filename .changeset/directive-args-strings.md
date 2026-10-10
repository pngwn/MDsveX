---
'@mdsvex/parse': patch
---

A plugin that gives a directive node `args` that are not strings gets a `TypeError` where it sets them, in the `attrs` of `wrap_inner`, `prepend`, `append` or `wrap_from`, or in `node.attrs.args = ...`. Such a node used to fail later in the renderer, or render with the args ignored.
