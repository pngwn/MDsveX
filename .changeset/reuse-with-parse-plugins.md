---
'mdsvex': patch
'@mdsvex/parse': patch
---

`CompilerSession` and the vite plugin keep their tree, plugin dispatcher and renderer from one document to the next when parse plugins are configured, as they already did without plugins. They are rebuilt when `parse_plugins` is a different array, so pass a new array to change the plugins.

A plugin that keeps a `NodeView` after its document has compiled now gets an error when it uses the view once the next document has started. It would otherwise read and write the nodes of that document. `TreeBuilder.reset()` works on a builder with plugins, and resets its dispatcher.
