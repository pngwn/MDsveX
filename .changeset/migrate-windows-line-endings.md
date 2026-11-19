---
'@mdsvex/migrate': patch
---

A document with Windows line endings is migrated like any other. Svelte after the first code fence of such a document was not recognised, so its expressions were escaped as markdown. The output is written with linefeeds.
