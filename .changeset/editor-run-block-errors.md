---
'@mdsvex/source-map': patch
'@mdsvex/language-core': patch
---

The editor reports a code block marked `run` that the build would reject, at its fence: a language no block runs in, `run` beside `eval`, a `run=` value other than `client`, and, when the config is known, a block that runs with no component replacing `pre`.
