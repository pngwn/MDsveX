---
'@mdsvex/parse': patch
---

An inline directive that never closes keeps its source text when a document is streamed over the wire format. `x :tabs[y z` came out as `x undefined`.
