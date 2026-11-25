---
'@mdsvex/render': patch
---

`wrap_static` checks opening tag names for `slot`, `style` and `script` by character code instead of slicing every opening tag name, and skips the attribute scan on bare tags. Compiles with `wrap_static: true` are about 3% faster across real documents. Output is unchanged.
