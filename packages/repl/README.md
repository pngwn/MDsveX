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
  	"component_mode": "markdown"
  }
  ```

  Templates and component modules are scanned for their export names without being evaluated. `<script module>` is scanned for components, the whole file for `.js` and `.ts`, and `export *` is followed through the workspace. The REPL then passes `compile()` the plain options from `design/templates-and-components.md` and resolves `mdsvex:template/<name>` and `mdsvex:components` to workspace files. Specifiers that aren't workspace files are treated as npm packages.
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
