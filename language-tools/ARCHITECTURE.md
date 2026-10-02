# Language Tools Architecture

## Overview

The PFM language tools provide TypeScript intellisense, CSS support, and markdown outline for `.pfm` and `.svx` files inside VS Code, and for any other extension the mdsvex config lists. They are built on [Volar](https://volarjs.dev/), a framework for building language servers for embedded languages, and [svelte2tsx](https://github.com/sveltejs/language-tools/tree/master/packages/svelte2tsx), which transforms Svelte component syntax into TypeScript.

```
PFM source                    mdsvex config     [language-core]
    |                              |
    v  pfm_to_svelte()  <----------+             [source-map]
Svelte code + mappings (A)
    |
    v  svelte2tsx()           [svelte2tsx]
TypeScript code + v3 map
    |
    v  v3_to_volar_mappings() + compose_mappings()   [source-map]
PFM-to-TS mappings (composed)
    |
    v  Volar language server  [language-server]
LSP responses (hover, diagnostics, completions, etc.)
```

## Packages

### `source-map`

The mapping pipeline. Converts PFM source into valid Svelte (`pfm_to_svelte`), converts svelte2tsx's v3 source maps into Volar's offset-based format (`v3_to_volar`), and composes the two mapping layers into a single PFM-to-TS mapping (`compose_mappings`). The composition is the core of the system: it takes A-side mappings (PFM to Svelte) and B-side mappings (Svelte to TS) and produces direct PFM-to-TS mappings that Volar uses for all language features.

`pfm_to_svelte` doesn't build its own Svelte. It calls core `compile()` from `mdsvex` with the document's config and `strict_directives: false`, so the editor checks the same component the build makes. That includes the `metadata` export from the core YAML parser, the template wrapper and replacement imports. It then edits the output for the editor and carries the mappings along (`edit.ts`):

- **Frontmatter keys.** The `metadata` object is re-emitted with bare keys, each mapped to its key in the YAML, so hover and go-to-definition work from either side. With templates configured, its `template` value is typed as their names or `false`.
- **Virtual ids.** Each `mdsvex:*` import becomes one import per binding from the file the id resolves to, so TypeScript sees the real template and components.
- **Replaced elements and directives.** Each one maps its syntax, tag name or directive name to the export it uses, so hovering it shows the replacement. Its open and close syntax lose their capabilities, because they span the whole component tag and would otherwise report props the author never wrote. A typed element in `component_mode: 'all'` keeps checking its attribute values and expressions, but not its attribute names, since an unknown prop isn't an error.
- **Directive args** map to the props they become, so a wrong value is a type error on the arg.
- **Props probes.** For every template and directive the config knows, a type alias such as `type __mdsvex_props_0 = ComponentProps<typeof import("./Docs.svelte")["default"]>` holds its props, whether or not the document uses it. Completions read them with the type checker, so they work while the frontmatter or an arg is half typed.
- **Template props.** With a template, the instance script gets a `satisfies Partial<ComponentProps<typeof Template>> & Record<string, unknown>` check of the frontmatter object, whose keys map to the YAML keys for diagnostics only. Keys the template doesn't declare are fine, because they are just extra props.

A compile error becomes a diagnostic, and the compile runs again without what failed: no template for an unknown template, empty metadata typed `Record<string, any>` for frontmatter the core parser rejects, and non-strict directives for an unknown directive. So a document that is being typed still gets a component. The mappings the converter adds carry `editor: true`, and language-core keeps their capabilities through composition instead of upgrading them.

### Config

The language server can't run Vite, so it reads what the Vite plugin knows from files (`language-core/src/config.ts`). For each document, the nearest directory holding one of these wins:

1. **`node_modules/.mdsvex/manifest.json`.** The plugin writes it whenever its resolution or scan changes (`packages/mdsvex/src/manifest.ts`). It has every template and components module resolved to a file with Vite's resolver, their scanned export names, `component_mode`, `extensions`, and whether a custom frontmatter parser, a parse plugin that handles directives, or `select_template` is configured. For `select_template`, it also records the template each document picked when it last compiled. It is stale until `vite dev` or `vite build` has run once.
2. **`mdsvex.config.json`.** This is the static config the playground reads. language-core resolves its specifiers itself, covering relative paths, `file:` URLs, package.json `imports` such as `#lib/*` and package `exports`, but not Vite aliases. It reads export names from the TypeScript syntax tree, so the `typescript` option must be passed.

With neither, a document compiles with no templates or replacements, and unknown directives aren't reported, so nothing valid shows an error. Directives are also not reported when the manifest says a parse plugin handles directives, since it might handle them. A custom frontmatter parser silences YAML errors. The server watches each config file it reads and reloads its projects when one changes.

### `language-core`

The Volar language plugin. Orchestrates the full pipeline — calls `pfm_to_svelte`, runs `svelte2tsx`, composes mappings, and produces `VirtualCode` objects that Volar understands. It also post-processes composed mappings to fix boundary overlaps caused by Volar's inclusive-end offset translation (merging split attribute-name mappings, shrinking non-identity trailing boundaries, and deduplicating multi-target identifiers). Includes a minimal Svelte plugin (`svelte_plugin`) that runs svelte2tsx on `.svelte` files so that component prop types resolve when imported from `.pfm` files.

### `language-server`

The LSP server process. Wraps the language-core plugins for Volar's URI-based server API, registers TypeScript/CSS/Markdown service plugins plus two of its own: one reports compile diagnostics from the root virtual code, and one completes the frontmatter and directive args: template names, keys and literal values from the template's props, and arg names and literal values from the directive's props. It drops the markdown service's self-definition of a heading when another target exists, so a jump from a replaced heading goes straight to its component, and it intercepts hover responses to clean up svelte2tsx's verbose internal type display (stripping `__sveltets_2_IsomorphicComponent` wrappers and `SvelteComponent` type aliases down to just the component name and props).

### `typescript-plugin`

A TypeScript Server Plugin that teaches `tsserver` how to resolve `.pfm` imports. When a `.ts` or `.svelte` file imports from a `.pfm` file, this plugin runs the same language-core pipeline so TypeScript can see the module's exports and types. It is loaded by VS Code via the `typescriptServerPlugins` contribution in the extension manifest.

### `vscode-pfm`

The VS Code extension. Registers the PFM language, starts the language server as a child process, and configures the TypeScript plugin. The build step bundles the language server into a single `server.cjs` file and the extension into `extension.cjs`. This is the only package that ships to users.

## Key dependencies

- **`mdsvex`** (`packages/mdsvex`): core `compile()`, which `pfm_to_svelte` runs, and the manifest types. It exports from `dist/`, so it must be built before the language tools. `pnpm build:ls` from the repo root handles the full chain.
- **`@mdsvex/render`** (`packages/render`): the PFM renderer that produces Svelte output with per-node source mappings. It also exports from `dist/`.
- **`@volar/language-core`**, **`@volar/language-server`**, **`@volar/typescript`** — Volar framework packages.
- **`svelte2tsx`** — Transforms Svelte component syntax into TypeScript with v3 source maps.

## Build order

```
packages/{parse,render,mdsvex}  ->  language-tools/typescript-plugin
                                ->  language-tools/vscode-pfm (chains: language-server -> extension -> copy)
```

Run `pnpm build:ls` from the repo root to build everything in the correct order.

## Trying it locally

1. Run `pnpm build:ls` from the repo root.
2. Run `pnpm --filter mdsvex-demo dev` once, so the plugin writes `packages/test-app/node_modules/.mdsvex/manifest.json`. You can stop it once it has started.
3. Open `language-tools/vscode-pfm` in VS Code and run **Launch Extension (demo app)**. It opens `packages/test-app`.
4. Open `src/routes/editor/+page.svx`. The page lists what to hover, and it has two deliberate type errors.

**Launch Extension** opens `test-fixture` instead. There is no Vite there, so `note.pfm` gets its template from `mdsvex.config.json`.
