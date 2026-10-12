---
'@mdsvex/language-server': patch
---

The `pfm-language-server` command starts. It failed as soon as it was run, with `require is not defined in ES module scope`, so an editor other than VS Code could not start the server from the package.
