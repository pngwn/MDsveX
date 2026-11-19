---
'@mdsvex/render': minor
'mdsvex': minor
---

`component_mode: 'all'` now replaces HTML you type as well as elements written in markdown:

```ts
mdsvex({ components: '#lib/markdown.ts', component_mode: 'all' });
```

A lowercase element such as `<h2>` or `<img>` uses the same replacement as its markdown form, and a custom tag such as `<warning>` uses a `warning` export, so a components module can provide tags that work in every document without imports. Attributes pass through as props exactly as written, including `{expr}`, `{shorthand}`, `{...spread}` and `{@attach}`. A typed `h1` to `h6` gets `level`, and an `ol` without `start` gets `start={1}`. Children arrive as `children`, and void elements get none.

`<svelte:*>` tags and capitalised components are never replaced, so `<svelte:element this="img">` renders a plain element. An element with a directive (`bind:`, `on:`, `use:`, `class:`, `style:`, `transition:`, `in:`, `out:`, `animate:` or `let:`) stays an element, because a component can't take one. The compiler warns about it, and `compile()` returns the warning in `warnings`.
