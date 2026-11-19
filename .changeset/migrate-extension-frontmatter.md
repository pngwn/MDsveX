---
'@mdsvex/migrate': patch
---

`migrate_config` rewrites the `extension` option of mdsvex 0.x, so `extension: '.md'` becomes `extensions: ['.md']`. It flags `frontmatter.marker` and `frontmatter.type`, which are gone: frontmatter is always fenced with `---`.
