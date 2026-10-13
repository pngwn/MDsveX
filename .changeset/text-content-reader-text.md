---
'@mdsvex/parse': patch
---

`node.text_content` in a parse plugin is the text a reader sees. The lines of a paragraph are joined with a space, where a soft break and a hard break used to add nothing, and the text of a comment inside the node is left out. A comment node still gives its own text.

```js
// one
// two <!-- hidden --> three
paragraph: { parse: (node) => () => node.text_content };
// was 'onetwo  hidden  three', now 'one two  three'
```
