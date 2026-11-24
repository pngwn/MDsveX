---
'@mdsvex/parse': patch
---

A parse plugin that registers an `on_close` callback on an outer node no longer keeps its inner descendants off the plain open and close fast paths. Nodes opened above the highest live close callback stay on `plain_from` and `plain_close`, and empty view and callback maps are no longer cleared between parses. List-heavy documents with outer close callbacks parse about 4% to 5% faster. The tree is unchanged.
