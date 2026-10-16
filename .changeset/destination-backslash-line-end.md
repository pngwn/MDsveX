---
'@mdsvex/parse': patch
---

A backslash before a space or a line end in a link destination is a literal backslash, and the destination ends after it. `[a]: /u\` at the end of a line defines `/u\` and leaves the next line alone, where it used to put the line end into the url and read the next line as more of it. The same definition in a block quote now works, an angle destination no longer runs over a line end, and an inline link `[x](/u\` with its `)` on the next line is text, as it is without the backslash.
