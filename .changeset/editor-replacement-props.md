---
'@mdsvex/language-core': patch
'@mdsvex/source-map': patch
---

The editor checks the props markdown gives a replacement component against the props it takes. A `src` the component does not accept is reported at the destination of the image, an `alt` at its text, a `level` at the heading marker and an `href` at the destination of the link, or at the whole link or image when it is a reference. A prop the component does not declare is not reported, as for HTML it replaces.

