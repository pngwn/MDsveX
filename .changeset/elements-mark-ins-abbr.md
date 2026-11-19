---
'@mdsvex/plugin-elements': minor
---

Three inline directives over native elements: `:mark[text]` renders a `<mark>`, `:ins[text]` an `<ins>` that takes its `datetime` and `cite` as args, and `:abbr[HTML](title="HyperText Markup Language")` an `<abbr>`. An `:abbr` with no `title` warns `abbr_without_title`. A mark is a tint behind the text, set by `--mark-color`, so it reads on a dark page.
