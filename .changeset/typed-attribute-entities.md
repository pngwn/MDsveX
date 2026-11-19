---
'@mdsvex/render': patch
'mdsvex': patch
---

Attribute values in raw html render as written, so an entity like `&amp;` is no longer escaped a second time.

```md
<div title="a &amp; b">x</div>
```
