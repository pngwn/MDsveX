---
'mdsvex': patch
'@mdsvex/render': patch
---

mdsvex now ships type declarations, so TypeScript finds types for `compile`, `CompileOptions`, `mdsvex` and the other exports instead of reporting a missing declaration file. Types for `@mdsvex/render` also check under TypeScript 6.
