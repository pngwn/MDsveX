---
'@mdsvex/render': patch
---

Sourcemaps build faster because identity-mapped text is encoded as one run per span instead of one sorted segment per character.
