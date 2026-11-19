---
'@mdsvex/migrate': patch
---

`migrate` keeps the Svelte in a document as written. An expression such as `{items[0].a_b}` used to get its brackets, underscores and asterisks escaped as markdown, `<svelte:head>` became a link, and a `{/each}` after a list joined its last item.

```js
migrate('Hello {user.first_name}, you have **{items[0]}**.');
// 'Hello {user.first_name}, you have *{items[0]}*.'
```

Expressions, `{#if}` blocks, `{@html}` tags, `svelte:` elements, `<script>`, `<style>` and tags with attributes such as `on:click|once={go}`, `{...props}` and `--gap="1rem"` all pass through unchanged, and the markdown around and inside them is still converted.
