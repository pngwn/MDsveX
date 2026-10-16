---
'mdsvex': minor
---

`mdsvex/host` exports `read_json_config`, which reads an `mdsvex.config.json` into the manifest the Vite plugin writes for the same options, with the list of what is wrong with it. The host passes how it resolves a specifier and reads the exports of a module, so it runs without Vite or Node. The editor and the playground read their config with it.
