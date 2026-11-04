# mdsvex for Zed

A [Zed](https://zed.dev) extension for `.svx` and `.pfm` files. It highlights with the tree-sitter grammar in `../tree-sitter` and runs `@mdsvex/language-server`, the server the VS Code extension uses.

## Layout

- `extension.toml`: the manifest. `[grammars.mdsvex]` points at this repo, a commit and `path = "language-tools/tree-sitter"`, and Zed clones that commit and compiles `src/parser.c` and `src/scanner.c` to wasm itself.
- `languages/mdsvex/config.toml`: file types, brackets, comments, list continuation
- `languages/mdsvex/highlights.scm`: Zed's capture names. Markdown constructs take the `.markup` captures Zed's own markdown uses (`title.markup`, `emphasis.markup`, `link_uri.markup` and so on), so themes style both the same. The grammar's `queries/highlights.scm` uses nvim style names Zed themes don't know.
- `languages/mdsvex/injections.scm`: a copy of the grammar's `queries/injections.scm`. Keep the two in step.
- `outline.scm`, `brackets.scm`, `overrides.scm`: the outline panel (headings, flat, since the grammar has no sections), bracket pairs, and the comment and string scopes `config.toml` brackets refer to
- `src/mdsvex.rs`: installs and starts the language server

## Language server

The extension installs `@mdsvex/language-server` from npm at the version of its `next` tag, since `latest` is a deprecated `0.0.0` placeholder until 1.0 and Zed's own version lookup reads only `latest`. It checks the tag once a session and keeps the installed server when offline. Once `latest` is real, `tagged_version` can become `zed::npm_package_latest_version`.

The server reads templates, components and plugins from `node_modules/.mdsvex/manifest.json`, which the Vite plugin writes when `vite dev` or `vite build` runs, or else from a `mdsvex.config.json`. A project configured only in `vite.config` has no templates in the editor until Vite has run once there. Run `editor: restart language server` afterwards.

Two things differ from Zed's defaults:

- The LSP language id is `pfm` (`language_ids` in `extension.toml`). With Zed's default, the language name, the server ignores the document.
- The server loads TypeScript from `initializationOptions.typescript.tsdk` and fails to start without it. VS Code passes its own; here it is the project's `node_modules/typescript/lib`, or else the TypeScript npm installed beside the server as its peer.

Zed settings override both:

```json
{
	"lsp": {
		"mdsvex-language-server": {
			"binary": {
				"path": "/path/to/MDsveX/language-tools/language-server/dist/server.cjs"
			},
			"initialization_options": {
				"typescript": { "tsdk": "/path/to/typescript/lib" }
			}
		}
	}
}
```

`binary.path` runs a local build of the server instead of the npm one, with `--stdio` unless `binary.arguments` says otherwise.

## Trying it

In Zed, run `zed: install dev extension` and pick this directory. Zed compiles `src/mdsvex.rs` with the Rust it finds through rustup. Zed builds the grammar from the `rev` in `extension.toml`, so a change to the grammar shows up only after that commit is pushed and `rev` points at it. To try an unpushed grammar, set `repository` to `file:///absolute/path/to/MDsveX` and `rev` to a local commit for the session, and set them back before committing.

Zed's log (`zed: open log`) shows grammar compile errors and query errors. A query that names a node the grammar lacks disables that whole file, so after a grammar change run each query against it:

```bash
cd language-tools/tree-sitter && for q in ../zed/languages/mdsvex/*.scm; do npx tree-sitter query "$q" test/highlight/document.svx > /dev/null || echo "$q"; done
```

Embedded languages come from Zed: JavaScript, TypeScript, CSS and YAML are built in, LaTeX for math and other fence languages need their own extensions.
