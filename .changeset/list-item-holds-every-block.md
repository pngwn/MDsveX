---
'@mdsvex/parse': patch
---

A list item holds the same blocks as the document. A Svelte block opens inside one, a line that holds only a comment, a component or a `{@tag}` has no paragraph around it, and a thematic break indented to the item is inside the item.

```md
- {#if show}
  text
  {/if}
- above
  ---
  below
```
