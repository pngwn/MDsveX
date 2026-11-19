---
'@mdsvex/render': patch
---

In a streaming render, an html element that is still open keeps its attribute text as written. `title="a &amp; b"` showed as `a &amp;amp; b` until the closing tag arrived.
