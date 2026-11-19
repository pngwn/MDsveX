---
'@mdsvex/render': minor
'mdsvex': minor
---

Elements written in markdown can be replaced with your own Svelte components. Point the `components` option at one or more modules, and each export named after an element replaces that element:

```ts
// vite.config.ts
mdsvex({ components: '#lib/markdown.ts' });
```

```ts
// src/lib/markdown.ts
export { default as h2 } from './Heading.svelte';
export { default as img } from './Image.svelte';
```

Specifiers resolve the way an import from the Vite root would, so aliases, package exports and `#lib/...` subpath imports work, as does `new URL('./markdown.ts', import.meta.url)`. A `.svelte` module works too, and its `<script module>` exports are the replacements.

Only elements produced by markdown syntax or by parse plugins are replaced. HTML you type yourself stays as it is. A replacement gets the element's attributes as props, plus `children` unless the element is void (`img`, `hr`, `br`). Some elements also get extra props:

- `h1` to `h6` get `level`.
- `pre` gets `lang`, `meta` and the raw `code`.
- `ol` gets `start`.
- `li` gets `checked`, when a plugin sets it.
- `th` and `td` get `align`.

Each document imports only the components it uses. When a module's export names change, the dev server recompiles the documents that use it.
