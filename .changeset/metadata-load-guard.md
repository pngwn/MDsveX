---
'mdsvex': patch
---

A `?metadata` request to the dev server only reads documents the server may serve. The path has to end in one of the configured extensions and pass Vite's `server.fs` rules (`allow`, `deny` and `strict`), as a request for the file itself would. A document outside `server.fs.allow` that is imported with `?metadata` in the browser needs its directory added to that option. Server rendering and builds read documents as before.
