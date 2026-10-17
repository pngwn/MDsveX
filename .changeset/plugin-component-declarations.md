---
'@mdsvex/plugin-tabs': patch
'@mdsvex/plugin-toc': patch
'@mdsvex/plugin-citations': patch
---

The declarations of the `Tabs`, `Tab`, `Toc`, `Cite` and `Bibliography` components name their prop types in full. They used `Snippet`, `ClassValue` and the plugin's own types without importing them, an error with `skipLibCheck` off and `any` props with it on.
