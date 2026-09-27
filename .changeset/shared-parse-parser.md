---
'@mdsvex/parse': patch
---

parse_markdown_svelte reuses one parser across calls instead of building a new one for every document.
