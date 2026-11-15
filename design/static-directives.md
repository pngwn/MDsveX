# Static directives: design

Status: draft (2026-11-13). Every open question decided the same day: Option A, `.static.svelte` file names, and the recommendations for Q2 to Q5. Phases 1 to 5 are built (2026-11-14, see §8). In dev and in a build a static directive renders as its shell, with its styles and assets, and the browser never loads its component. A plugin's module declares one by the same file rule, and the check of §6 runs at startup and before each render. Left: the first-party plugins switch (phase 6) and moving `<svelte:head>` (Q4). Replaces §5 of `design/plugin-directives.md` and answers its Q4 (styles), Q5 (where static is declared) and Q6 (loading components at build time). The build-time render was first checked by a spike (§9).

A static directive is a directive whose component is rendered once at build time. Its HTML is written into the document's markup. No component code ships for it, and it adds no hydration work. The children of a static directive stay ordinary document markup, so `{expr}`, live components and live directives inside it still work (the "shell with holes" of `plugin-directives.md` §5.2, kept as it was).

Three requirements:

1. **A simple, natural way to declare one,** file based for the common case.
2. **Plugins can declare static and live directives.**
3. **The render inherits the Vite config,** so every plugin, alias, `define`, preprocessor and CSS tool the site uses runs over a static component too.

## 1. Principles

1. **Static is an optimisation, never a change in meaning.** A static directive renders the same HTML as the live one. Outside Vite (`compile()`, the REPL, the streaming preview) every directive is live.
2. **The component decides.** Only a component's author knows whether it is self-contained. The mode belongs to the component that ends up rendering the directive, not to the document and not to a separate list.
3. **Live by default.** A directive is static only when someone said so. `:::tabs` must never stop working silently.
4. **The user's pipeline, not ours.** A static component is loaded by the same Vite plugins as every other module of the site. mdsvex adds no second compiler for it.
5. **Check, never infer.** mdsvex can find a handler that would never run in a static component and say so. It never decides the mode by looking at the code.

## 2. Declaring a static directive: the options

Today a site registers directives in a barrel. A `components` or template module carries `export * as directives from './directives.ts'`, and that module re-exports components by directive name (`templates-and-components.md` §6.1). A plugin registers them in its bundle: `module` plus the keys of `directives` (`plugin-directives.md` §3.1). Every option below starts from that.

### Option A: a file name, `Callout.static.svelte` (chosen 2026-11-13)

```ts
// src/lib/directives.ts
export { default as callout } from './Callout.static.svelte';
export { default as badge } from './Badge.static.svelte';
export { default as tabs } from './Tabs.svelte';
```

- **What marks it:** the file name. `<name>.static.<ext>` for any component extension the site compiles, so `Note.static.svx` works too.
- **How mdsvex reads it:** the export scan already lexes the barrel. It now also records the specifier of each re-export and resolves it, so every directive name maps to a file. No component file is read to learn its mode.
- **Precedent:** SvelteKit's `+page.server.ts`, and Nuxt's `.server.vue` and `.client.vue` components. `.server` is out for us: Kit forbids client code from importing `*.server.*` modules, and a document's barrel is client code.
- **Overrides (Q5) come for free.** The mode follows the component that wins. A site that replaces a plugin's static `step` with its own `Step.svelte` gets a live `step`. Nothing has to be turned back.
- **Templates work unchanged,** since a template's directives are a barrel too.
- **Costs:** to switch a component's mode you rename the file, and the rename shows up in the barrel's import. Re-exporting a third-party live component as static takes a one-line wrapper file (`Badge.static.svelte` that renders `<Badge {...props} />`).
- **One form only.** A static component is registered as `export { default as name } from './X.static.svelte'`. Any other form, such as `import X from …; export { X }` or `export *` from a module that holds static components, is a startup error. §5.2 explains why the form matters.

### Option B: a second namespace export

```ts
// src/lib/markdown.ts
export * as directives from './directives.ts';
export * as static_directives from './static_directives.ts';
```

- **What marks it:** which barrel the component is registered in.
- **How mdsvex reads it:** exactly as it reads `directives` today. `scan_exports` already records namespace re-exports.
- **Strength:** the client never loads the static barrel, so a static component can import server-only code (`node:fs`, `$lib/server/db`) with nothing extra from mdsvex. Option A needs the stripped client module of §5.2 to get the same result.
- **Costs:** two barrels per scope, and a name in both is an error. The mode sits in the registration, away from the component. A component library cannot ship its mode.
- **Verdict:** the runner-up, not chosen. It stays the fallback if serving a stripped barrel (§5.2) turns out to be fragile in practice.

### Option C: a marker inside the component

```svelte
<script module>
	export const mode = 'static';
</script>
```

- **Variants:** a module export (above), a prologue string `'use static';` like React's `'use client'`, or a comment pragma `<!-- @mdsvex static -->`.
- **Decorators are not possible.** TC39 decorators apply only to classes and their members, and a Svelte component is neither. The nearest thing is `<svelte:options>`, and Svelte 5 rejects an attribute it does not know (`svelte_options_unknown_attribute` is a compile error). Every in-code form is a convention that mdsvex reads, which is what the variants above are.
- **How mdsvex reads it:** it reads and lexes each component file's module script at startup and again on every edit. A value that is not a literal is an error.
- **Strength:** the mode travels with the component, even into a component library, without a rename.
- **Costs:** every registered component file is read. The marker is a real runtime export, or a comment that formatters and minifiers treat as nothing. It is the least visible option: nothing at the import site says the component is static.

### Option D: a config list

```js
mdsvex({ static_directives: ['callout', 'badge'] });
```

- **Strength:** obvious, and costs nothing to read.
- **Costs:** it lives away from the component, it repeats names, it has no per-template form, and it can't say which component it means when a template overrides a name. This is what `plugin-directives.md` §5.6 drafted for sites.
- **Verdict:** rejected as the main mechanism. Option A covers its uses.

### Not an option: inference

mdsvex could compile the component and call it static when it has no state, effects or handlers. That fails three ways. A child component it imports can be interactive. `$state` used for a local calculation is harmless at build time. A component that gains an `onclick` would silently turn live, or worse, silently ship dead. So the analysis is a check on a component someone declared static (§6), never the switch.

### Not an option: the author of the document chooses

`:::callout(static=true)` gives the choice to the wrong person. The document's author can't know whether the component is self-contained, and args are props.

### Summary

|                                  | A: file name                 | B: namespace    | C: in-code marker     | D: config             |
| -------------------------------- | ---------------------------- | --------------- | --------------------- | --------------------- |
| lives with the component         | yes                          | no              | yes                   | no                    |
| zero config                      | yes                          | yes             | yes                   | no                    |
| per template                     | yes                          | yes             | yes                   | no                    |
| override follows the winner (Q5) | yes                          | yes             | yes                   | needs a rule          |
| what mdsvex reads                | resolved paths               | names           | every component file  | nothing               |
| client never loads static code   | via a stripped barrel (§5.2) | by construction | via a stripped barrel | via a stripped barrel |
| visible where it is registered   | yes                          | yes             | no                    | no                    |

## 3. Plugins

**Plugins follow the same rule as sites.** A bundle's `module` re-exports `Steps.static.svelte` and `Step.static.svelte`. mdsvex scans the bundle's module once, when it resolves it at startup (`plugin_registry.ts` already resolves it there). The bundle shape gains nothing.

- **The `static` key on a bundle directive is gone** (phase 5). Keeping it would have given plugins a second way, and an override would need a rule for it.
- **A plugin option that switches the mode picks the module,** as `steps({ unstyled })` already picks `directives/unstyled` and diagram picks pele or mermaid in its setup function.
- **A plugin that needs both modes per use owns two names.** Its handler produces the one it wants: `wrap_from('directive_container', { name: 'embed_live' })` for an interactive embed, plain `embed` for a still one. This is principle 1 of `plugin-directives.md` ("rewrite to directives") and needs no new API.
- **Bound handlers run the same either way.** Live or static decides how the tree renders, never what the tree is (`plugin-directives.md` §6).

The alternative is to keep `static: true` on the entry, as `plugin-directives.md` §3.1 drafted. It costs no scan and lets a plugin compute the mode from its options. Its problem: when a site overrides the component, the flag describes a component that no longer renders. That is Q2.

**Which first-party directives would be static:** `steps`/`step`, `figure`, the elements (`badge`, `kbd`, `abbr`, `mark`, `ins`, `ruby`), callouts, and the embeds that render a plain iframe or image. `tabs`, `accordion` (if it animates) and anything that coordinates through context stay live.

## 4. Where the render runs

### 4.1 One static environment

mdsvex adds a Vite environment named `mdsvex_static` (`consumer: 'server'`). Every static component is imported and rendered there, with `svelte/server` and `createRawSnippet` from `svelte` imported through the same runner.

- **It copies the `ssr` environment's `resolve` options** (`noExternal`, `external`, conditions) in `configEnvironment`. The spike found this is required. Without it `svelte` is externalised in the new environment, `svelte/server` and the component load two copies of the Svelte runtime, and an async render fails with `await_invalid` because the runtime that renders never saw the async flag the component set.
- **It has its own module graph.** A static component never enters the client graph, and the environment's `hotUpdate` says exactly which static component changed.
- **mdsvex knows when a module is loaded for a static render.** Its hooks check `this.environment.name`. That is what lets it mark assets (§5.3).

### 4.2 In dev

The environment lives on the user's dev server, next to `client` and `ssr`. It is cheap until the first static directive asks for it.

- **HMR:** when `hotUpdate` for `mdsvex_static` sees a change, the shells rendered from the modules it touched are dropped. The documents that used them compile again, and the client gets a document update. The client never loaded the component, so there is nothing else to update.

### 4.3 In a build

A build has no dev environment, and a build plugin context cannot run a module. mdsvex starts a **child dev server** that hosts only the static environment:

```js
createServer({
	configFile: config.configFile,
	root: config.root,
	mode: config.mode,
	server: { middlewareMode: true, hmr: false, ws: false, watch: null },
	appType: 'custom',
	optimizeDeps: { noDiscovery: true, include: [] },
});
```

- **It loads the same config file,** so it has the same plugins, aliases, `define`, svelte options and preprocessors. The spike checked `$lib`, `define`, `import.meta.env.PROD` and `compilerOptions.experimental.async` under SvelteKit.
- **The mdsvex instance inside the child sees a flag** and only hosts the environment. It never starts another child.
- **Started lazily,** at the first document with a static directive, and closed at `closeBundle`. A site without static directives pays nothing.
- **Shells are cached for the process.** SvelteKit builds the server and then the client in one process, each with its own plugin instances. The spike saw `buildStart` twice. The cache key is the shell key (§5.1) plus a hash of the component's module graph, so the second build renders nothing again. A cache on disk under `node_modules/.mdsvex/static/` would carry shells across builds. That is later work.
- **A build with no config file** (`configFile: false`, plugins passed inline) can't be reproduced in a child. It is a clear error at the first static directive. An escape hatch, such as an option that returns the inline config, waits until someone needs it.

### 4.4 Rejected ways to run it

- **An SSR pre-build.** Build every static component with `vite build --ssr` into a temp directory, then import the output. It runs production transforms and gives real asset URLs. But it needs the full component list before the first document compiles, adds a second Rollup build to every build, and does nothing for dev.
- **Rendering on the page's own server.** The HTML has to be in the client bundle too, or SvelteKit's client-side navigation renders nothing. `{@html}` with server markup and no client value does not hydrate reliably. So the HTML must be in the document before Svelte compiles it.
- **`resolveConfig` plus `createRunnableDevEnvironment` with no server.** It is lighter than a child server, and `configureServer` hooks would not run. It is also an undocumented use of the API. Worth trying later as an optimisation of §4.3, behind the same interface.

## 5. The render

### 5.1 Pipeline

`compile()` stays synchronous and pure. The pause after the parse already exists: a document that shows a `src=` file, or whose plugins defer work, returns a waiting `Parsed`, and the Vite plugin renders it once the inputs arrive (`await_sources`, `await_plugins` in `packages/mdsvex/src/compile.ts`). Static directives are a third reason to wait.

```
compile() parse (sync)        Vite plugin (async)                    compile() render (sync)
──────────────────────        ───────────────────                    ───────────────────────
parse with plugins            for each missing shell key:
find static directives  ──►     import the component in mdsvex_static  ──►  write each shell,
compute shell keys              await render() with hole snippets            fill its holes,
missing key → wait (Parsed)     strip hydration comments, collect CSS        add CSS and asset
                                and asset marks                               imports
```

- **The scan sees the rewritten tree,** because it runs after the parse with the document's plugins. A static `step` that the steps plugin made from a heading is found like a written one. This was the "two-phase compile" that `plugin-directives.md` §5.4 listed as missing. It now exists.
- **Shell key:** the component's resolved file, its args sorted by name, and which of `label` and `children` are present. One exported function builds it, used by the plugin and the renderer.
- **Core input:** `CompileInputs.shells`, a table from key to the finished shell, set by a host on the inputs of a `CompilerSession`. It is no `compile()` option: a check in `inputs_of` costs compiles that never use it (see the inline budget notes), and only a host that can render components has shells to give. `CompileInputs.await_shells` makes an into compile wait, as `await_sources` does. A `ComponentSource` gains the names it serves statically (`static`), so `compile()` knows which directives to look for without knowing about files. A missing shell is a need of type `shell` on `Parsed.needs`, after images and sources.

### 5.2 What the client loads

A document imports live directives by name from its registration module (`mdsvex:directives` and the template and plugin ids). A static directive is not imported. Two details make sure the client never evaluates a static component:

- **The stripped registration module.** In dev the browser evaluates every re-export of a barrel it loads. When a barrel re-exports a static component, mdsvex serves it to the client with those `export { default as name } from './X.static.svelte'` statements removed. The lexer gives each statement's exact span, which is why §2 allows only that form. Side-effect imports such as `import './steps.css'` stay.
- **A document with a static directive imports its registration module for its side effects,** even when it uses no live directive from it. This keeps the barrel's CSS, which is how every first-party plugin ships its styles today (`plugins/steps/src/directives.ts`).

So a static component may import server-only code. Build-time data then works with no extra API. With `experimental.async` a static component can `await` at the top level, and the spike rendered one.

### 5.3 Assets

The spike's build render gave `<img src="/src/lib/logo.svg">`, a dev-server URL that does not exist in production. Only small files were safe, because they inline as data URIs.

- **mdsvex marks assets in the static environment.** Its `load` hook (`enforce: 'pre'`, before Vite's asset plugin) answers an asset id loaded in `mdsvex_static` with a marker string that names the file. The spike checked this.
- **The shell fill turns each marker into an import.** In an attribute or in text, the marker becomes an `{expression}` bound to an import of the file in the document's script. This is what `import_images` already does for markdown images, so hashing, `base` and the build's asset handling apply. Dev and build follow the same path.

### 5.4 Styles (Q4)

- **Scoped styles of the component.** In the static environment `X.svelte?inline&svelte&type=style&lang.css` gives the compiled CSS as a string. `?inline` has to come first: with `&inline` last, vite-plugin-svelte read the id as the component itself. The document imports one CSS module per static component. Its id is the component's own path with an mdsvex query, so relative `url()`s resolve as they do in the component. mdsvex serves the raw compiled CSS there, and the client's CSS pipeline (PostCSS, Tailwind, Lightning CSS, code splitting) runs over it once. Two documents that use one component share one module.
- **Plain CSS the render reached.** Every `.css` module in the component's static graph is imported by the document by its real path, which covers a component that imports a stylesheet.
- **This replaces the fragile path** of importing vite-plugin-svelte's style module into a client graph that never compiled the component (`plugin-directives.md` §5.5).

### 5.5 Holes, comments and `<svelte:head>`

- **Holes** are `createRawSnippet` snippets that render `<mdsvex-hole name="label"></mdsvex-hole>`. The spike's output had each hole exactly where the component rendered its snippet.
- **A hole missing or rendered twice is a compile error** naming the directive and the component, since content would be dropped or duplicated.
- **Hydration comments** (`<!--[-->`, `<!--]-->`, `<!---->`, `<!--[0-->` and their kin) are removed, and braces are escaped, before the shell enters the document.
- **`<svelte:head>` output** from a static component is Q4.

### 5.6 Errors

- **A render that throws** is a compile error that names the directive, its position in the document and the component, with the component's stack.
- **A build with a static directive and no config file** is an error (§4.3).
- **The checks of §6** fail the compile.

## 6. What a static component can't do, and the check

Unchanged from `plugin-directives.md` §5.4: no runtime (no handlers, effects or transitions survive), no context from the page, every snippet rendered exactly once, string props only.

**The check** (principle 5): when a component is declared static, mdsvex parses it with `svelte/compiler` and reports what can never work in static output. That covers event attributes (`onclick`), `bind:`, `use:`, `{@attach}`, `transition:`, `in:`, `out:`, `animate:`, and `getContext` or `setContext` calls. It does not report `$state` or `$derived`, which are fine for a calculation made once. It does not look into child components (Q3). The check runs on the component file only, at startup and on edit, not per document.

## 7. Interactions

- **Language tools.** The manifest records each directive's mode, so hover can say "rendered at build time" and the check's errors can surface as diagnostics. The editor still compiles every directive live (principle 1).
- **Streaming preview and REPL:** live, as today.
- **`wrap_static`:** a static shell is markup with no Svelte in it, so a run of static directives joins a wrapped run of static blocks.
- **Template precedence:** unchanged. The mode follows the winning component (§2, Option A).

## 8. Phasing

| step | work                                                                                                                                                                  |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | built: name→file map in the export scan, the `.static.` rule, the re-export form check, modes in `ComponentSource` and the manifest                                   |
| 2    | built: `mdsvex_static` environment with `ssr` resolve copied, dev only, render and holes, `CompileInputs.shells`, the wait after the parse, HMR of a static component |
| 3    | built: stripped registration module, side-effect import of it, styles (§5.4), asset marks (§5.3)                                                                      |
| 4    | built: the child server, the process cache, the no-config-file error                                                                                                  |
| 5    | built: the check (§6), plugins move to `.static.svelte` names, `BundleDirective.static` dropped                                                                       |
| 6    | first-party plugins switch the directives listed in §3                                                                                                                |

### 8.1 What phase 2 found

- **No line breaks around a shell's body.** A live container gets `\n` around its children, which Svelte trims at a snippet's edges. In a shell the body is plain markup, where the same `\n` is a space between the label and the body.
- **A document whose only directives are shells** routes through the replacement walks with no import. `comp_begin` marks it (`dir_shelled`), and the instance script is only opened when there are import lines (`hoist_begin` reads `comp_lines`, not `has_components`).
- **The key is computed in the renderer and in the scan of needs by one function** (`dir_shell_key`), which also throws for an arg named `children` or `label` as a live render does.
- **A shell is cleared as a whole when anything in the static graph changes**, and the documents that used any shell compile again. Per-shell dependencies can come later, if a site has enough shells for this to show.

### 8.2 What phase 3 found

- **The stripped barrel is a variant id, not the barrel itself.** Outside the static environment, and only while shells render, `mdsvex:directives` resolves to `<barrel>?mdsvex-live`. A post transform blanks each re-export of a `.static.` file with spaces, keeping newlines, so the map of the code before still holds. A page that imports the barrel by its own path still gets all of it.
- **The scoped styles are served at `<component>.mdsvex-static.css`**, a path beside the component so relative `url()`s resolve, with no `.svelte` query vite-plugin-svelte could read as a component request. mdsvex compiles the component in the static environment and loads vite-plugin-svelte's style module there, so the css is the raw output of Svelte and the client's css plugins run over it once. It is compiled again on request after a change, so a style module is never served stale while its document waits to compile.
- **Style imports keep the live order:** the scoped styles first, as vite-plugin-svelte puts them at the top of a compiled component, then what the component imports.
- **A shell carries its imports** (`Shell.imports`): its styles and an `import __mdsvex_asset_<n> from "<file>"` for each marked asset. The renderer adds each line once, after the component imports, and a side-effect import of each directives module a shell came from when no component import already runs it.
- **An asset is marked when it loads in the static environment** as a plain asset (`assetsInclude`) or with `?url`. Any other query is a transform of its own (`?enhanced`, `?inline`) and loads as it would live.
- **Checked in a SvelteKit dev server in a browser:** the page fetched `index.ts?mdsvex-live`, the component's `.mdsvex-static.css`, the asset and the barrel's css, and never `Callout.static.svelte`. A live counter inside the shell hydrated and counted. An edit of the component's style and markup reached the open page by HMR.
- **Vite 8 needs a `tsconfig.json` for a `.ts` barrel in a Kit app.** Without one the static render fails with a `ShellError` that names the directive and the tsconfig error. A real Kit app always has one.
- **Q4 is an error for now:** a component that writes `<svelte:head>` fails with `renders <svelte:head> content`. Moving it into the document's head is still the decision.

### 8.3 What phase 4 found

- **An asset marker carries its id,** hex encoded, not a number. In a build the marker is made by the mdsvex plugin inside the dev server the build started, a separate instance whose numbers the build can not see. Each shell numbers the locals itself, the same number for an id in every shell of a process.
- **What shells made is kept per process,** keyed by config file, root and mode: the shells, the scoped styles and the asset numbers. SvelteKit's client build reads what its server build rendered, and its child server is never started unless a shell is missing.
- **The child server is started at the first missing shell and closed at `closeBundle`,** or at `buildEnd` with an error. It loads the config file, so `define`, aliases, svelte options and plugins apply. A plugin with `apply: 'build'` does not run in it, as it is a dev server.
- **`import.meta.env.PROD` follows `NODE_ENV`.** It is `true` in a `vite build` from the command line. A build started inside vitest, where `NODE_ENV` is `test`, renders `false`.
- **A watching build** drops the shells that read a changed file in `watchChange`, and a document that waited for a shell watches the files that shell read (`addWatchFile`). A document compiled from shells already made does not add those watches. Fixing that needs `compile()` to report which shells a document used.
- **The live barrel and the style modules work in a build unchanged,** the post plugin now runs in builds too.
- **Checked by hand on SvelteKit:** `vite build` from the command line, both passes in 2.1s, the prerendered page had the hashed asset url, `prod=true` and the define, the css asset had the scoped and the barrel styles, no client file held the component. In `vite preview` a live counter inside the shell hydrated and counted, with no console output.
- **Not measured:** the cost on the micro rows of the perf harness.

### 8.4 What phase 5 found

- **The check is a walk of `svelte/compiler`'s `parse`** of the component's own file, loaded only when a static component exists. It reports event attributes on elements (`onclick` on `<button>`, `<svelte:window>`, `<svelte:element>`), `on:`, `bind:`, `use:`, `{@attach}`, `transition:`, `in:`, `out:`, `animate:`, and calls of `getContext`, `setContext`, `hasContext`, `getAllContexts` and `createContext` imported from `svelte`, under any local name. On a component, `onclick` is a prop like any other and passes, `bind:` and `{@attach}` do not.
- **One error lists every problem** with its line and column, and says to rename the file without `.static` to render it live.
- **It runs at registration** (startup, and a rescan of a barrel whose modes changed), which stops the server or the build, **and before each render** of a shell, so an edit that adds a handler in dev fails the document that uses it, and the next edit that removes it renders again. A file is parsed once per content.
- **What it skips:** `<style>` blocks are blanked before the parse, as a preprocessed one (`scss`) may not parse as css. Code Svelte can not parse passes, the render reports it. A static component that is not a `.svelte` file (`.static.svx`) is not checked.
- **A plugin's module is scanned once at startup,** after it resolves, by the same `static_names` as a barrel, so its form errors and the check are the same. A mode change in a plugin's module needs a restart. Its directives module resolves with `?mdsvex-live` while shells render, as a barrel does.
- **The names reach compile on the vite plugin's own copy of the bundle,** under `Symbol.for('mdsvex.static_names')` from an internal module, so the public `Bundle` type gains nothing. The registry hands out a new bundles array once the scan found one, as compile keys what it unpacks by the array.
- **A config with plugins and no `components` option** now gets the static environment, since a plugin may serve a static directive.
- **Not checked yet:** a plugin published to npm whose module Vite prebundles in dev. Its re-exports are inlined in the prebundled file, so the live variant has nothing to blank and the client loads the static component's code in dev. A build is unaffected. Phase 6 meets it first, and `optimizeDeps.exclude` of the plugin's module is the likely answer.

## 9. Spike (2026-11-13)

Run against `packages/test-app`'s dependencies: Vite 8, Svelte 5.55.1, vite-plugin-svelte 7, Kit 2.56. Throwaway fixtures, not committed.

- **Child server in `vite build`, plain Svelte:** 1.3s to start cold and 77ms warm. The first render took 740ms, which is mostly transforming Svelte's internals.
- **Child server in `vite build`, SvelteKit:** 851ms for the server build's child and 158ms for the client build's. Renders took 393ms and 285ms. `$lib` resolved, `define` was applied, `import.meta.env.PROD` was `true`, top-level `await` in the component rendered, and holes landed where the snippets render.
- **Custom environment in dev, `ssr` resolve not copied:** `await_invalid`, from two Svelte runtimes. With `ssr`'s `resolve` copied, it rendered.
- **Asset marker** from a `load` hook in the custom environment: works with `enforce: 'pre'`. Without it, Vite's asset plugin answers first.
- **CSS:** `?inline&svelte&type=style&lang.css` gave the scoped CSS as a string. With `&inline` last, vite-plugin-svelte served the component instead.
- **A custom environment in a Kit build** is not built (no `buildApp`), so adding it to the config is harmless in a build.

## 10. Open questions

- **Q1. Option A or B?** Decided 2026-11-13: A, `.static.svelte` file names. The mode shows on the component and where it is registered. The stripped barrel is a span removal at statement boundaries the lexer already gives.
- **Q2. The `static` key on bundle directives.** Decided 2026-11-13: drop it, so plugins follow the file rule like sites (§3). Keep it if computing the mode from plugin options matters more than one rule.
- **Q3. How strict is the check?** Decided 2026-11-13: an error for the constructs listed in §6, in the component's own file only. Following imports to child components is possible but slow, and it starts to look like inference.
- **Q4. `<svelte:head>` in a static component.** Decided 2026-11-13: move its HTML into the document's `<svelte:head>`, with identical strings written once. The alternative is a compile error.
- **Q5. Shells on disk.** Decided 2026-11-13: later, once a site shows the render as a measurable part of its build.
