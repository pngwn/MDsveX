---
'@mdsvex/render': patch
---

HTML rendering is faster because the renderer reads its node kinds and mapping codes as literals and calls its own functions directly instead of through exported bindings.
