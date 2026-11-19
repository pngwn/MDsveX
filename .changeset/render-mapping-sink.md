---
'@mdsvex/render': patch
---

The low-level render helpers exported with a leading underscore now collect source mappings into a `MapSink` instead of an array, and the `PendingMapping` type is no longer exported.
