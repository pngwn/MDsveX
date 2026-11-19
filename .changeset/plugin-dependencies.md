---
'@mdsvex/parse': minor
'mdsvex': minor
---

Plugins can load files and tell the host what they read:

- `ctx.depend(path)` names a file the output depends on. A compile result has them as `dependencies`.
- `ctx.read(path)` and `ctx.resolve(specifier)` use the `read` and `resolve` options a host passes. The Vite plugin passes both.
- `ctx.cached(key, load)` shares one load between documents. A key that is a path is a dependency, and `CompilerSession.invalidate(paths)` drops it.

The Vite plugin compiles a document and its `?data` import again when a file its plugins depend on is created, changed or deleted, also outside the project root and in a watch build, and warns in dev when a document waits five seconds for a plugin.
