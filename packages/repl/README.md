# @mdsvex/repl

A browser REPL for mdsvex. It compiles markdown with mdsvex, compiles the result with Svelte, bundles everything with Rollup in a worker, and runs it in a sandboxed iframe. Nothing touches a server apart from fetching npm packages.

It started as a copy of the [Svelte playground](https://github.com/sveltejs/svelte.dev/tree/main/packages/repl) at `sveltejs/svelte.dev@fda3e9a` (MIT). The upstream package can't be installed: it isn't published and it depends on private workspace packages.

## What it adds over the Svelte playground

- **Markdown files.** `.svx` and `.md` files are components. Each one compiles through mdsvex and then Svelte, in both the bundler and the per-file compiler.
- **A Svelte output tab.** It shows the code mdsvex produced, with hover highlighting mapped back to the markdown. The JS and CSS tabs map back to the markdown as well, by chaining the two source maps.
- **`mdsvex.config.json`.** The REPL does the work the Vite plugin does in a real project:

  ```json
  {
  	"extensions": [".svx", ".md"],
  	"templates": {
  		"default": "./Template.svelte",
  		"docs": { "component": "./Docs.svelte", "components": "./docs.js" }
  	},
  	"components": "./components.js",
  	"component_mode": "markdown",
  	"unwrap_images": false,
  	"heading_ids": false,
  	"smart_punctuation": false
  }
  ```

  Templates and component modules are scanned for their export names without being evaluated. `<script module>` is scanned for components, the whole file for `.js` and `.ts`, and `export *` is followed through the workspace. The REPL then passes `compile()` the plain options from `design/templates-and-components.md` and resolves `mdsvex:template/<name>` and `mdsvex:components` to workspace files. Specifiers that aren't workspace files are treated as npm packages. `unwrap_images` is the plugin's option of that name, and the AST tab shows the tree it gives. `heading_ids` takes `true` or `false`, a slug function has no JSON form. The ids are added by `compile()` after the parse, so they are in the output and not in the AST tab. `smart_punctuation` takes what the plugin's option takes: `true`, `false`, or an object with `quotes`, `dashes` and `ellipses`. The renderer makes the substitutions, so they too are in the output and not in the AST tab.
- **Syntax highlighting.** Code is highlighted with twinkleplop, as in the Vite plugin. `highlight` in `mdsvex.config.json` takes the plugin's options that JSON can hold:

  ```json
  {
  	"highlight": {
  		"languages": { "vue": "html" },
  		"default_language": "ts",
  		"on_unknown_language": "plain",
  		"line_numbers": true,
  		"annotations": ["hl", "add", "del", "shiki_notation"],
  		"render": { "indent_guides": true }
  	}
  }
  ```

  Every bundled language is available, so `languages` only holds aliases. `annotations` names the built-in annotations and `shiki_notation`. `false` turns highlighting off. `twoslash` and `parse_meta` aren't available. The worker loads only the languages a document names, the first time it sees them. mdsvex adds no CSS, so pass a theme stylesheet as `injected_css` to colour the preview.
- **Plugins and directives by folder.** JSON can't hold a plugin, so the REPL registers these by where the files are, and the bar over the editor has a menu for each: files, directives, plugins and config:

  | file | what it is |
  | --- | --- |
  | `plugins/<name>/plugin.js` | its default export is an entry of the `plugins` option: a bundle, a function that returns one, or a parse plugin on its own. It is named after its folder unless it has a name |
  | `plugins/<name>/<directive>.svelte` | the component of a directive of that plugin, named after the file |
  | `directives/<directive>.svelte` | the component of a directive with no plugin, named after the file |

  The bundler builds the plugin files first, with their imports from the workspace and npm, and runs them in its worker. Every document then compiles with what they export, and the compile waits for the work they defer. _new plugin_ in the plugins menu asks for a name and makes both files.
- **A streamed preview.** With _streamed_ on, the preview feeds the entry document to the incremental parser a few characters at a time and renders it with `@mdsvex/render` as it grows, with the same plugins, directives and `components`. Its controls play, pause and restart the stream, set the chunk size and interval, and scrub to any point of the document. A `<script>` in the document does not run there, and templates don't apply. `stream` in the state keeps it.
- **`?raw` imports.** `import source from './document.md?raw'` gives a workspace file as a string, as Vite does, so a harness can feed markdown to the parser itself.
- **URL state.** `encode_state` and `decode_state` turn a whole playground into a gzipped base64url string for a URL hash.

## What it drops

The following upstream features are dropped:

- Tailwind
- the runes and migration UI
- aliases
- Svelte 3 and 4 support
- the site-kit components and icons

## Usage

```svelte
<script>
	import { Repl } from '@mdsvex/repl';

	let repl;

	$effect(() => {
		repl.set({ files: [{ name: 'App.svx', contents: '# hello' }] });
	});
</script>

<Repl bind:this={repl} theme="dark" onchange={() => save(repl.get())} />
```

### Props

All props are optional.

| Prop | Default | Purpose |
| --- | --- | --- |
| `svelte_version` | `latest` | Svelte version to compile and run against |
| `theme` | | Colours of the REPL itself |
| `preview_theme` | `theme` | Colours of the preview |
| `orientation` | | Editor and output side by side, or stacked |
| `embedded` | | Embedded mode |
| `relaxed` | | Sandbox setting for the preview iframe |
| `can_escape` | | Sandbox setting for the preview iframe |
| `injected_js`, `injected_css` | | Code added to the preview |
| `onchange` | | Called when the files change |
| `onerror` | | Called on errors |
| `onversion` | | Called with the Svelte version |

### Methods

- **`set(state)`** replaces every file. It resolves once the first bundle lands.
- **`get()`** returns the current state.

### Entry file

The preview mounts `state.entry`. Without one, it mounts the first of `App.svx`, `App.md` or `App.svelte`.

### Theming

Every colour and font is a `--repl-*` custom property on `.mdsvex-repl`, so a host can override any of them.

## Vite setup

The package ships source, so the consuming app compiles it. Its workers are loaded by URL, and Rollup's wasm must stay next to the file that fetches it. The mdsvex worker imports `mdsvex/compile`, which holds only the compiler, so neither Vite nor Node builtins reach the browser and nothing else needs excluding:

```js
export default {
	server: { fs: { allow: ['../repl'] } }, // only needed inside this monorepo
	optimizeDeps: { exclude: ['@rollup/browser'] },
	worker: { format: 'es' },
};
```
