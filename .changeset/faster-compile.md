---
'mdsvex': patch
---

Compiling markdown is much faster, especially with source maps, and repeated one-off compiles no longer set up a new compiler each time. The vite plugin transforms markdown files many times faster and only builds the part of the source map that the Svelte output needs.
