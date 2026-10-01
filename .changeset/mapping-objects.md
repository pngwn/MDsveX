---
'@mdsvex/render': patch
'mdsvex': patch
---

Source mappings are now objects whose `sourceOffsets`, `generatedOffsets`, `lengths` and `data` are getters. Read those properties directly; spreading a mapping no longer copies them.

```ts
const copy = { ...mapping, data: other }; // before: offsets copied, now: offsets missing
const copy = { sourceOffsets: mapping.sourceOffsets, generatedOffsets: mapping.generatedOffsets, lengths: mapping.lengths, data: other };
```
