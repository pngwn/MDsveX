---
'@mdsvex/parse': patch
---

`NodeBuffer` now stores all of a node's fields together in one typed array, so its raw per-field arrays such as `_kinds` and `_starts` no longer exist; read nodes through its accessor methods instead. Node ids passed to a custom emitter are now node buffer indices, so text nodes take an id too and the ids seen by `open` can skip numbers.
