---
'mdsvex': patch
---

Vite 6 or later is required. The dev server picks up a changed component or template file through a hook that Vite 5 never calls, so on Vite 5 documents kept the old components and templates until a restart.
