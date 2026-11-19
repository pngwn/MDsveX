---
'@mdsvex/parse': patch
---

Over the wire, a heading with trailing spaces whose content a plugin wrapped, as the autolink plugin does, shows its text once. `## A   ` rendered as `A   A`.
