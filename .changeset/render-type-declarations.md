---
'@mdsvex/render': patch
---

The package ships built type declarations. Its types were its TypeScript source, which a project that imports `mdsvex` checks under its own compiler flags, so a project with `noUncheckedIndexedAccess` got errors from inside `@mdsvex/render` that it could not fix.
