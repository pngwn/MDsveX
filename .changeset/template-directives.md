---
'mdsvex': minor
---

A template can export its own `directives` namespace from its module script, the same way a components module does. For a document wrapped in that template, its directives take precedence over the root ones:

```svelte
<script module>
  export * as directives from './docs-directives.ts';
</script>
```
