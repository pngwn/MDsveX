---
'@mdsvex/render': minor
'mdsvex': minor
---

Generic directives now render as your own Svelte components. A components module declares its directives with a `directives` namespace export. Directives are a separate namespace from element replacements, so a `table` export never serves `:::table`:

```ts
// src/lib/markdown.ts, passed as mdsvex({ components: '#lib/markdown.ts' })
export { default as img } from './Image.svelte';
export * as directives from './directives.ts';
```

```ts
// src/lib/directives.ts
export { default as Callout } from './Callout.svelte';
export { default as abbr } from './Abbr.svelte';
```

Here is what each directive passes to its component:

- **Args** arrive as string props.
- **Leaf and container text** in the brackets arrives as a `label` snippet.
- **Inline directive text** arrives as `children`.
- **A container's body** arrives as `children`.

So `:::Callout[Heads up](kind=warn)` passes `kind="warn"`, a `label` snippet and the body as `children`.

A directive with no component is passed to parse plugins' `directive_inline`, `directive_leaf` and `directive_container` handlers. If none of them replaces it, the compile fails with a `DirectiveError` that names the directive and its line. Before this change, an unhandled directive rendered as its children and a leaf directive disappeared. A directive with a component never reaches a plugin's directive handlers.
