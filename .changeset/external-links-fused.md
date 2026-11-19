---
'@mdsvex/plugin-external-links': patch
---

`rel` and `target` are set on each link as it closes, so a streamed document has them on a link as soon as the link arrives. A plugin that sets `rel` or `target` on links has to come before this one in `plugins` for its values to be kept.
