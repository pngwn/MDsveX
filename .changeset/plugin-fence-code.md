---
'@mdsvex/parse': patch
'@mdsvex/render': patch
'mdsvex': patch
---

A code fence a parse plugin makes shows the code the plugin puts in it. Text appended inside the fence is its code, in the html, through the highlighter, in a `pre` replacement and in a block that runs, as if the fence had been typed:

```js
const fence = node.append('code_fence', { info: 'ts' });
fence.append('text', 'let a = 1;');
// <pre><code class="language-ts">let a = 1;</code></pre>
```
