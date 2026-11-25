---
'@mdsvex/render': minor
---

The `components` prop of the `Node` component replaces the elements markdown makes in a stream, as it does in a compiled document, where it replaced only HTML typed in the source. A heading, paragraph, link, image, list, item, quote, code span, fence, table and its parts, rule, break and the inline marks are drawn as the component of their element name, with the props a compiled document gives it, and an open node is replaced as soon as it opens. The new `component_mode` prop takes `'markdown'` to keep typed HTML as plain elements. A typed element with a directive such as `bind:`, and a `script` or `style`, is no longer replaced.
