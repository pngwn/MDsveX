---
'mdsvex': patch
---

The first document with a `math` fence, which loads the math renderer, is parsed once, so its parse plugins run once for it. It keeps its parse while the renderer loads and then only renders again.
