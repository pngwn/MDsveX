---
'@mdsvex/render': patch
'mdsvex': patch
---

Spread and attachment attributes on HTML you type, such as `<div {...rest} {@attach tooltip}>`, are no longer rendered as `...rest={...rest}`, which Svelte failed to compile.
