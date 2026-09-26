---
'@mdsvex/parse': minor
---

Export `normalize_newlines` and `raw_offsets`, so tools that read parser positions can map them back to a source with `\r\n` line endings.

```ts
const offsets = raw_offsets(source); // null when there is nothing to map
const start = offsets ? offsets.to_raw(node_start) : node_start;
```
