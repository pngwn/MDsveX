---
'@mdsvex/migrate': patch
---

`migrate_config` writes valid JavaScript when the option it removes is the only one and has a trailing comma, such as `mdsvex({ layout: false, })`. The comma used to stay behind in an empty object.
