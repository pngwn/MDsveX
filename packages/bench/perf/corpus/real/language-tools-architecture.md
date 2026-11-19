# Language Tools Architecture

## Overview

The PFM language tools provide TypeScript intellisense, CSS support, and markdown outline for `.pfm` files inside VS Code. They are built on [Volar](https://volarjs.dev/), a framework for building language servers for embedded languages, and [svelte2tsx](https://github.com/sveltejs/language-tools/tree/master/packages/svelte2tsx), which transforms Svelte component syntax into TypeScript.

```
PFM source
    |
    v  pfm_to_svelte()       [source-map]
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

### `language-core`

The Volar language plugin. Orchestrates the full pipeline — calls `pfm_to_svelte`, runs `svelte2tsx`, composes mappings, and produces `VirtualCode` objects that Volar understands. It also post-processes composed mappings to fix boundary overlaps caused by Volar's inclusive-end offset translation (merging split attribute-name mappings, shrinking non-identity trailing boundaries, and deduplicating multi-target identifiers). Includes a minimal Svelte plugin (`svelte_plugin`) that runs svelte2tsx on `.svelte` files so that component prop types resolve when imported from `.pfm` files.

### `language-server`

The LSP server process. Wraps the language-core plugins for Volar's URI-based server API, registers TypeScript/CSS/Markdown service plugins, and intercepts hover responses to clean up svelte2tsx's verbose internal type display (stripping `__sveltets_2_IsomorphicComponent` wrappers and `SvelteComponent` type aliases down to just the component name and props).

### `typescript-plugin`

A TypeScript Server Plugin that teaches `tsserver` how to resolve `.pfm` imports. When a `.ts` or `.svelte` file imports from a `.pfm` file, this plugin runs the same language-core pipeline so TypeScript can see the module's exports and types. It is loaded by VS Code via the `typescriptServerPlugins` contribution in the extension manifest.

### `vscode-pfm`

The VS Code extension. Registers the PFM language, starts the language server as a child process, and configures the TypeScript plugin. The build step bundles the language server into a single `server.cjs` file and the extension into `extension.cjs`. This is the only package that ships to users.

## Key dependencies

- **`@mdsvex/render`** (`packages/render`) — The PFM renderer that produces Svelte output with per-node source mappings. Exports from `dist/`, so it must be built before the language tools (`pnpm build:ls` from the repo root handles the full chain).
- **`@volar/language-core`**, **`@volar/language-server`**, **`@volar/typescript`** — Volar framework packages.
- **`svelte2tsx`** — Transforms Svelte component syntax into TypeScript with v3 source maps.

## Build order

```
packages/render  ->  language-tools/typescript-plugin
                 ->  language-tools/vscode-pfm (chains: language-server -> extension -> copy)
```

Run `pnpm build:ls` from the repo root to build everything in the correct order.
