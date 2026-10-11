---
'@mdsvex/language-core': minor
---

The editor accepts the directives of the `plugins` option. It reads each plugin's directives and element replacements from the manifest the Vite plugin writes, below the config's own modules, so a plugin directive resolves to its component and completes its args. `mdsvex.config.json` takes `plugins: [{ name, module, directives }]`, the directive names a plugin owns and the module that exports them. A plugin's handlers do not run in the editor, which checks the document as written.
