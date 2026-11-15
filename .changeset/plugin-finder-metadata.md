---
'@mdsvex/plugin-anchors': patch
'@mdsvex/plugin-citations': patch
'@mdsvex/plugin-code-blocks': patch
'@mdsvex/plugin-diagram': patch
'@mdsvex/plugin-elements': patch
'@mdsvex/plugin-embeds': patch
'@mdsvex/plugin-emoji': patch
'@mdsvex/plugin-external-links': patch
'@mdsvex/plugin-figures': patch
'@mdsvex/plugin-link-check': patch
'@mdsvex/plugin-numbering': patch
'@mdsvex/plugin-page-data': patch
'@mdsvex/plugin-references': patch
'@mdsvex/plugin-steps': patch
'@mdsvex/plugin-tabs': patch
'@mdsvex/plugin-toc': patch
---

Each package's `package.json` has an `mdsvex` field that says what the plugin is for and what it reads: `concerns`, the jobs it does, such as `layout` or `cite`; `syntax`, samples of what it reads, each compiled with the plugin when the docs build and required to change the output; `needs`, the mdsvex options it needs beside it, such as `heading_ids`; and `waits`, why a document that uses it needs `compile_async` or the Vite plugin. The docs' plugin finder reads it, and a third-party plugin can set the same field. Nothing in the plugins' code changes.
