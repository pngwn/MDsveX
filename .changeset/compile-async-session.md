---
'mdsvex': minor
---

`compile_async` takes a `CompilerSession` as an optional third argument. What plugins load with `ctx.cached` is kept in that session, so a host that compiles again when files change can call `session.invalidate(paths)` and get fresh loads. Without one, loads are kept for as long as the same `plugins` array is passed, as before.
