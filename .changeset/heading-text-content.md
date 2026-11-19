---
'@mdsvex/parse': patch
---

`node.text_content` of a heading is the text a reader sees, as it is for every other node. In a plugin run by `compile` or `parse_markdown_svelte` it used to be the source of the heading as written, markup included, and the flattened text only when the document was streamed.

```js
// ## Two *words* and `code`
node.text_content; // before: 'Two *words* and `code`', after: 'Two words and code'
```
