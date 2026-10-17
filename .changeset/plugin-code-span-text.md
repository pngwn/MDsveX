---
'@mdsvex/parse': patch
'@mdsvex/render': patch
'mdsvex': patch
---

A code span or an html comment a parse plugin makes shows the text the plugin puts in it, as a code fence does. Before, it rendered empty:

```js
paragraph.append('code_span').append('text', 'a < b');
// <code>a &lt; b</code>
```
