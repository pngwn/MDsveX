---
'@mdsvex/parse': patch
---

A Svelte block opens inside a block quote, and inside a container directive that is in one. It ends with the quote when it is left open.

```md
> {#if show}
> text
> {/if}
```
