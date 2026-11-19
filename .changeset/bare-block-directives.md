---
'@mdsvex/parse': minor
---

Leaf and container directives no longer need their square brackets. `::toc` and `:::note` alone on a line are directives with no label, the same tree as `::toc[]` and `:::note[]`, and args can follow the name directly: `::toc(depth=2)`, `:::note(kind=warn)`.

```md
:::steps
## Install

## Configure
:::
```

Only an argument list and trailing spaces or tabs may follow the name. Anything else keeps the line a paragraph, so `::before is a pseudo-element`, `::name:` and `:::name [x]` are still text. When both are written the brackets come first, `::name(k=v)[x]` is a paragraph.

A line that is exactly `::word` or `:::word` used to be a paragraph and is now a directive. Write `\::word` to keep it as text.

The inline form is unchanged and still needs its brackets: `:name` in a sentence is text, so `:tada:` and `std::vector` are safe.
