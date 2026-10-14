---
'mdsvex': minor
---

`mdsvex/host` exports the rest of what a tool without Vite rebuilds from the plugin: the `mdsvex:*` virtual id prefixes, `manifest_resolver` to find the file an id stands for in an editor manifest, `metadata_module` and `data_module` to serve `?metadata` and `?data` imports, and `queue_manifest` with `manifest_json` to write a manifest the editor extension reads.
