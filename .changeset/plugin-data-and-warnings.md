---
'mdsvex': minor
---

`compile()` returns what plugins left in `ctx.data` as `data`, keyed by plugin name, and their warnings in `warnings`.

```js
const result = compile(source, { heading_ids: true, plugins: [toc()] });

result.data.toc.headings;
// [{ depth: 1, id: 'guide' }, { depth: 2, id: 'set-up' }]

result.warnings;
// [{ plugin: 'toc', code: 'skipped_level', message: '...', start: { line: 11, column: 0 } }]
```

`data` is `undefined` when no plugin left any. A warning from a plugin has the name of the plugin as `plugin`, and the Vite plugin reports it with the file and the position like any other warning. Nothing exports `data` from the compiled document yet.
