---
'@mdsvex/parse': patch
---

A parse that stops moving through its input throws a `ParseStallError` with the `offset` it stopped at. It used to log `Infinite loop detected` and hand back a tree cut short at that point.
