---
'@mdsvex/parse': patch
---

A line written as a footnote definition is no longer read as a link reference definition. `[^note]: Word` used to vanish from the output, because one word after the colon made it a definition for the label `^note`. It is now a paragraph with the text as written, as `[^note]: two words` already was, and a link reference label can not start with `^`.
