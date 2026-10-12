---
'@mdsvex/parse': patch
---

A container directive holds the same blocks as the document. A Svelte block opens inside one, a line that holds only a comment or a `{@tag}` is no longer wrapped in a paragraph, and a line that starts with an autolink such as `<MAILTO:a@b.c>` is a link.

```md
:::box
{#if a}
b
{/if}
<!-- note -->
:::
```
