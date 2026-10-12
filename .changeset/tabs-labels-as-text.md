---
'@mdsvex/plugin-tabs': patch
---

A code tab is labelled as soon as its fence opens, and its label is text in the tab's `label`, as the label of a heading tab is. A tab component of your own no longer gets a `title` prop: every tab has a `label`, which holds the name of the fence, or the number of a tab with nothing to show. Content written before the first tab is reported when that tab opens, without waiting for the container to close. The tab buttons and panels render as before.
