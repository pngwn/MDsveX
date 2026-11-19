---
'@mdsvex/language-core': minor
'@mdsvex/source-map': minor
'mdsvex': patch
---

The editor knows the `plugin_data` export of a document. When the config has plugins, a document that reads `plugin_data` and a module that imports it type check against the `PluginData` interface, so a key a plugin declared has its type and any other is `unknown`. The manifest the Vite plugin writes says whether a plugin could leave data, and `mdsvex.config.json` says so with a `plugins` entry.
