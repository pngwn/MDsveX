---
'@mdsvex/parse': minor
---

Every part of a document has a node whose offsets slice it from the source, which a formatter that prints from the source needs:

- A link reference definition, `[label]: /url "title"`, is a `definition` node with the attrs `label`, `href` and `title`, from its bracket to the end of its destination or title. Its value range is the label. It renders nothing, the links that use it still carry its url.
- An element's value range runs from the end of its open tag to the start of its close tag, so `start` to `value_start` is the open tag, over several lines too, and `value_end` to `end` the close tag. A self closing or void element has both at its end.
- The value range of a link starts after its `[` and that of an image after its `![`, it used to start at 0.
- The root ends at the length of the source, it used to end one short, and an empty document has a root of `[0, 0]`.
