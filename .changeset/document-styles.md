---
'mdsvex': patch
---

A `<style>` block in a document works. The vite plugin no longer compiles vite-plugin-svelte's style request for the document as markdown, which broke the build.
