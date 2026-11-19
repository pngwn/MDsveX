---
'@mdsvex/parse': patch
---

Incremental parsing recognises a `---`, `***` or `___` line inside an HTML block, a Svelte block or a directive container as a thematic break when it is the last line fed so far, instead of turning it into a paragraph.

```md
<div>
---
```
