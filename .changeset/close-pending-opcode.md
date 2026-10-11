---
'@mdsvex/parse': minor
---

The parser says which closes are not final, so an emitter can treat every other close of a pending node as its commit.

- `Emitter` has an optional `close_pending(id, end, kind)`. The parser calls it in place of `close` for an inline delimiter (`*`, `_`, `~~`, `~`, `^`) that reaches the end of its block with no closing delimiter, which it revokes afterwards. An emitter without the method gets `close` as before.
- Over the wire that close is `["C", id, 1]`. A consumer that reads only the id is unaffected.
- A paragraph that starts with an html tag or an image is opened pending. When it closes with text of its own, the parser now sends a `commit` for it (`["K", id]` over the wire, the opcode a loose list already sends for its paragraphs). It used to send nothing.
- `Emitter` has an optional `follow(parser)`, called when a parser is made for it or bound to it. `TreeBuilder` uses it with the new `PFMParser.skip_ids` to keep node ids equal to buffer slots when a plugin adds nodes.

The wire format documentation covers `K` and the flag on `C`.
