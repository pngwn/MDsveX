---
'@mdsvex/migrate': patch
---

`migrate_config` tells a 0.x config that `rel="nofollow"` is gone. mdsvex 0.x put it on every link to another site and had no option for it, and links are now written as they are. The note, of the new kind `external_links`, says how to keep it with `@mdsvex/plugin-external-links`.
