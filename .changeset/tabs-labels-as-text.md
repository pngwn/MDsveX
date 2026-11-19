---
'@mdsvex/plugin-tabs': patch
---

A code tab is labelled as soon as its fence opens. Every tab has a `label`, which holds the content of its heading, the name of its fence, or the number of a tab with nothing to show. Content written before the first tab is reported when that tab opens, without waiting for the container to close.
