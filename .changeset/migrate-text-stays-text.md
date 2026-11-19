---
'@mdsvex/migrate': patch
---

Text that only looked like markup stays text. An escaped or encoded `<`, `{`, `}` or `&`, such as `\<b>`, `&lt;b&gt;` and `&#123;x&#125;`, is written with a backslash. It used to be written bare, so the migrated document had a real `<b>` element or a Svelte expression where the old one showed the characters.
