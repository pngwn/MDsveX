---
'@mdsvex/render': minor
'mdsvex': minor
---

A directive whose component file is named `<name>.static.svelte` renders once at build time. Its HTML is written into the page, and the browser never loads or hydrates the component. Content inside it stays live, so expressions, components and live directives in its label and children still work. Register it from the directives barrel like any other directive:

```js
// src/lib/directives/index.ts
export { default as callout } from './Callout.static.svelte';
export { default as counter } from './Counter.svelte';
```

The component renders through your own Vite config in dev and in `vite build`, so aliases, `define`, Svelte options and other plugins apply to it. Its scoped styles and the assets it imports reach the page as they would from a live component. A plugin declares a static directive the same way, by the file name of the component its module re-exports, and the unused `static` key of a plugin directive is gone.

A static component that uses something which can never run in static output, such as an event handler, `bind:`, `use:`, `{@attach}`, a transition or `getContext`, is an error naming each use. A component that does not render a snippet it is given exactly once, or that writes `<svelte:head>` content, is an error too.
