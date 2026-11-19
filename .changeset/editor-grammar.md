---
'vscode-pfm': minor
---

The editor highlights more of a document:

- tables, with their cell bars, the `||` of header columns, the delimiter row and the `>` and `^` of merged cells
- `~subscript~` and `^superscript^`
- the `[ ]` and `[x]` of a task list item
- the meta of a code fence: `src=`, `run` and `run=client`, titles, line ranges, highlighted words and props
- link reference definitions and the links that use them
- the `:::` that closes a container directive, and a backslash line break

A fence with anything after its language, such as ```` ```ts title="a.ts" ````, now gets the highlighting of its language, which only a bare ```` ```ts ```` did before. `math` fences are read as LaTeX and `svx` fences as a document.
