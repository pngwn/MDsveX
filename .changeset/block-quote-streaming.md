---
'@mdsvex/parse': patch
---

When a document is parsed incrementally, content inside a block quote is emitted as it arrives. A quoted line opens as soon as the first character after its `>` marker shows what it is, instead of when its newline arrives. The parsed document is unchanged.
