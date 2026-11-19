---
'mdsvex': minor
---

Leaf and container directives can be written without square brackets: `::toc`, `::toc(depth=2)`, and `:::steps` closed by `:::`. They render the same component as `::toc[]` and `:::steps[]`, with args as props and no `label` snippet, and a plugin's handlers run for the bare container as they do for the bracketed one.

A line that is exactly `::word` or `:::word` used to be a paragraph. It is now a directive, so it needs a component or a plugin, and without one the compile fails with the usual error naming the directive and its line and column. Write `\::word` to keep such a line as text. The inline form still needs its brackets, `:word` in a sentence stays text.
