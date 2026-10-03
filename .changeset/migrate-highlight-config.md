---
'@mdsvex/migrate': minor
---

`migrate_config` rewrites the mdsvex 0.x `highlight` option. `alias` becomes `languages`, and `optimise` is removed:

```ts
// before
mdsvex({ highlight: { alias: { yavascript: 'javascript' }, optimise: false } });

// after
mdsvex({ highlight: { languages: { yavascript: 'javascript' } } });
```

`highlight: false` is kept. A `highlighter` function can't be rewritten safely, so it gets a `// TODO(mdsvex-migrate)` comment linking to the migration guide and a `highlighter` note. An `escapeSvelte` import gets an `escape_svelte` note, and an alias to a Prism language twinkleplop doesn't have gets a `highlight_language` note.
