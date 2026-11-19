---
'@mdsvex/parse': patch
'@mdsvex/render': patch
'mdsvex': patch
---

The content of a typed `<pre>` or `<textarea>` is text, kept as written up to the close tag, as the content of `<script>` and `<style>` is. Line breaks and indentation stay, no paragraph or heading is made inside, and markdown markers are plain characters.

```md
<pre>
line one
  indented *x*

# line three
</pre>
```

The text goes to Svelte as it is written, so an expression such as `{value}` and an element such as `<b>` still work there. With `component_mode: 'all'` a `pre` component gets that text as its children.

A `<pre>` that starts a line is a block, as a `<div>` is: it ends the paragraph or the table on the line before it.
