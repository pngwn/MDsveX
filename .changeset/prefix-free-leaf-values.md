---
'@mdsvex/parse': patch
'@mdsvex/render': patch
---

The code of a fence, the text of a comment and the content of `<script>` and `<style>` no longer hold the `>` markers or the list indent of the lines they run over. A fence in a list item renders without the indent of the item in its code.

````md
- ```js
  const a = 1;
  ```
````

The code is `const a = 1;`, where it used to keep the two spaces before it. The parser stores this text on the node, and the node's value range still covers the source as written.
