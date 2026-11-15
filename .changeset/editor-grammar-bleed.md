---
'vscode-pfm': patch
---

The editor highlights a document as the parser reads it in more places:

- an unclosed `*`, `_` or `~~` no longer colors the rest of the file, it ends with its paragraph, and a mark opens after punctuation, as in `(*note*)`, and runs on over the lines of a block quote
- `**bold**` is bold, not an empty mark followed by text
- headings, fences and comments in block quotes and list items, a fence on the line of its list marker, and a heading at any indent
- a container directive with a label, `::::figure[The *penguin*](id=fig)`, and only the arguments the parser takes, a quoted `)` among them
- link text holds marks and images, as in a badge `[![npm](badge.svg)](url)`
- an import over several lines, and no import in a line of prose that starts with the word
- `<svelte:head>` is a tag, an autolink takes any scheme, a code span closes only on a run of its own length, and a superscript no longer runs over a code span
- an unclosed tag ends at a blank line
