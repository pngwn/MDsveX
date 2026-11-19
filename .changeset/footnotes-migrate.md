---
'@mdsvex/migrate': minor
---

Footnotes are migrated to PFM footnotes, where they used to be kept as escaped text. Each reference is written with the label of its definition, since PFM matches labels exactly, and a label loses the characters PFM does not allow in one. The blocks after the first paragraph of a definition follow it as blocks of the document.

A definition that starts with a list or a fence stays escaped text with its references, as does a second definition of a label. A `[^...]` that was no footnote is still escaped, which now matters: PFM reads every `[^label]` as a reference.
