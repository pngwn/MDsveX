---
'@mdsvex/parse': minor
---

The wire format says which characters the author escaped. A `T` opcode whose text starts at a character escaped with a backslash has a fourth field, `["T", id, ":b", 1]`. A client that reads three fields sees no change. `WireTreeBuilder` uses it to keep those characters from the text handler of a plugin, as the batch builder does.
