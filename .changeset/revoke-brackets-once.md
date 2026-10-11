---
'@mdsvex/parse': patch
---

A `[`, `![` or `:name[` that turns out not to be a link, an image or a directive stays with the text around it when it follows an HTML tag that is never closed. `<span>[a] b` put the bracket in a paragraph of its own and rendered `<p>[a</p>] b` after the tag. The opcode stream and the wire format now revoke such a node once, where the parser sent a second revoke when its block ended.
