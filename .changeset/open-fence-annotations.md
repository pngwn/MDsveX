---
'mdsvex': minor
---

A `create_highlight` config draws a fence that is still being written, as the `Node` component of `@mdsvex/render` does for a stream. A comment that may still become an annotation is not drawn until it is complete, nor is the first character of one, as the `/` of `//` is, and a line range in the meta that names lines not written yet waits for them. This needs twinkleplop 0.4, which mdsvex now depends on.
