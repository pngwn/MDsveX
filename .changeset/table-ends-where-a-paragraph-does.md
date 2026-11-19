---
'@mdsvex/parse': patch
---

A table ends at any line that would end a paragraph. The line that closes a Svelte block or a container directive is no longer read as a table row, and neither is a directive, a list item, a Svelte block or a block level HTML tag on the line after the last row.

```md
{#if show}
| a |
|---|
| b |
{/if}
```
