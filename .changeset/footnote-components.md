---
'@mdsvex/render': minor
'mdsvex': minor
---

Two replacement names for footnotes. A `footnote` export in a components module replaces a reference, and a `footnotes` export replaces the section at the end.

```js
// src/lib/markdown.js
export { default as footnote } from './markdown/Footnote.svelte';
export { default as footnotes } from './markdown/Footnotes.svelte';
```

`footnote` gets `label`, `number`, `href` and `id`, the link it would render as its `children`, and what its definition holds as the `note` snippet, which is enough to draw a side note or a hover card. `footnotes` gets the `<ol>` of notes as its `children`. The links and list items mdsvex writes for footnotes are not markdown nodes, so `a`, `sup`, `ol` and `li` replacements never get them.
