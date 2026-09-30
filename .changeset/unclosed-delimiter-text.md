---
'@mdsvex/parse': patch
---

An unclosed delimiter keeps exactly its own characters as text. A `[` or `![` at the end of a line is no longer left as empty text, and `foo *_*` no longer repeats the `_`.

```md
[
_
```
