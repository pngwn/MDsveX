---
'@mdsvex/migrate': minor
---

Add the `mdsvex-migrate` command. It migrates documents, configs and layouts in place, every `.md` and `.svx` file in a directory, and prints the notes as `path:line:column`. `--smartypants`, `--smartypants=<json>` and `--math` pass the 0.x options and `--check` writes nothing. `migrate_file(name, source, options)` chooses what to run from the file name, and keeps CRLF line endings in a document.
