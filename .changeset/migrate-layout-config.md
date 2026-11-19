---
'@mdsvex/migrate': minor
---

`migrate_config` rewrites the mdsvex 0.x `layout` option in a config file to `templates`:

```ts
// before
mdsvex({ layout: { _: './src/Default.svelte', blog: './src/Blog.svelte' } });

// after
mdsvex({ templates: { default: './src/Default.svelte', blog: './src/Blog.svelte' } });
```

Named layouts are no longer applied to documents in a folder of the same name, so the returned notes suggest a `select_template` that does the same. They also flag `layoutPropForwarding`, since templates always get the document's props.
