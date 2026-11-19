---
'mdsvex': minor
'@mdsvex/render': minor
---

Frontmatter becomes the document's metadata. The compiled component exports it from its `<script module>` as `metadata`, and `compile()` returns it as `metadata`. When the document already has a module script, the export goes into that script.

```md
---
title: Hello
tags: [svelte, markdown]
---
```

```svelte
<script module>
export const metadata = {"title":"Hello","tags":["svelte","markdown"]};
</script>
```

mdsvex parses the YAML that frontmatter commonly holds: strings, numbers, booleans, null, nested maps, block and flow sequences, `|` and `>` blocks and comments. Dates stay strings. Anything else, such as anchors or tags, fails with an error naming the line. For full YAML, pass a parser:

```js
import { parse } from 'yaml';

mdsvex({ frontmatter: { parse } });
```
