---
'mdsvex': patch
'@mdsvex/render': patch
---

Files with Windows (`\r\n`) or old Mac (`\r`) line endings compile to the same HTML as their `\n` equivalents, and their sourcemaps point at the right lines and columns in the original file.
