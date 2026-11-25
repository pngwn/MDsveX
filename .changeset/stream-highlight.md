---
'@mdsvex/render': minor
---

The `Node` component takes a `highlight` prop, the same function or `create_highlight` config the `highlight` option of `compile` takes, so a code fence in a stream is highlighted with the markup a compiled page has. An open fence is highlighted on every chunk while it is under 4,096 characters, a longer one when it closes.
