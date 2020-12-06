---
'svast': minor
'svast-stringify': minor
'svelte-parse': minor
---

Add a new SVAST node `SvelteDynamicContent` in order to disambiguate positions of expressions due to them not always having opening and closing braces(#174).

Ensure that unquoted attribute values are correctly parsed as separate values where appropriate(#178).
