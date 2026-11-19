---
'@mdsvex/render': minor
---

A `CodeHighlighter` can set `math: true` to say that it renders `math` fences as display math. Such a fence takes a `math` replacement instead of `pre`. The replacement gets the block's `props`, `code`, the fence meta as `meta`, and the block's body as children.
