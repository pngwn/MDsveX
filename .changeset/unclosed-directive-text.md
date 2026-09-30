---
'@mdsvex/parse': patch
---

An unclosed inline directive keeps its whole opener as text. Before, a line like `:name[` that was never closed kept only the `:`.

```md
:name[
# heading
```
