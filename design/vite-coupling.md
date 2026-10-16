# Where mdsvex depends on Vite: an audit

Status: audit of `next` at `e832387b`, 2026-10-13. Read from source, nothing was run. Statements about the built packages are inferred from the build config and marked so. Line numbers are for that commit.

The question it answers: mdsvex is expected to lean on Vite for loading modules and for rewriting things into imports. What leans on it beyond that, and what does someone who is not using Vite have to do today?

## Summary

- **The compiler is free of Vite and of Node.** `mdsvex/compile` reaches 32 source modules and none imports `vite`, `rollup` or a `node:` module. Every syntax feature and every compile option works through bare `compile()`. Nothing enforces this: no test and no build step would fail if a Node import crept in (section 5, item 1).
- **Most of the coupling is the kind that was expected:** virtual module ids, serving snippet and query modules, resolving config specifiers, watching and hot update. Section 2 lists it.
- **Seven things go beyond that** (section 3). The three that matter most:
  1. The public export scanner uses Vite to strip TypeScript, so the one helper a non-Vite host needs to build the `components` and `templates` options cannot run without Vite.
  2. The two-phase compile (`parse`, then what the document needs, then `render`) is the contract a host needs to supply files cleanly, and it is marked `@internal`.
  3. The plugin reaches into vite-plugin-svelte and SvelteKit by plugin name and edits their options.
- **The cost of the gaps is already visible in the repo.** The playground and the language tools are both non-Vite hosts, and between them and the plugin there are three implementations of export scanning, two of the virtual id resolver, and two config readers (section 4).
- **The first-party plugin packages have no Vite dependency.** All eight run under bare `compile()`. Three ship Svelte components and so need a bundler that understands Svelte packages, which is a general requirement and not a Vite one.

## 1. What works without Vite

Every row is a compile option or a property of the result, read in `compile.ts`.

| feature                                                  | bare `compile()`               | what the caller supplies                                                  | what the Vite plugin adds                                                                    |
| -------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| syntax, frontmatter, `metadata`                          | yes                            | nothing                                                                   | nothing                                                                                      |
| footnotes, smart punctuation, heading ids, unwrap images | yes                            | the option                                                                | validation only                                                                              |
| highlighting                                             | yes                            | a highlighter from `mdsvex/highlight`, languages loaded up front          | loads languages on first use; the `twoslash: true` shorthand                                 |
| math                                                     | yes                            | a renderer from `mdsvex/math`, loaded up front                            | loads Temml or KaTeX on first use                                                            |
| relative images as imports                               | yes                            | `import_images: true` (off by default here, on in the plugin)             | nothing; the output is a plain default import                                                |
| link rewriting                                           | yes, except `links.base: true` | `rewrite`, `links.routes`, `links.base` as a string or `{ import, from }` | makes `routes` absolute against the root; maps `base: true` to Vite's `base`                 |
| `src=` code from a file                                  | yes                            | `sources: { spec: text }`                                                 | resolves and reads the files, watches them                                                   |
| `run` blocks                                             | yes                            | `snippets` plus serving `result.snippets` as modules                      | resolves and loads the snippet ids, with maps                                                |
| component replacement, templates                         | yes                            | `{ specifier, names }` for each module                                    | resolution, export scanning, virtual ids, the merged template module, documents as templates |
| plugins and bundles                                      | yes                            | `plugins: [...]`                                                          | swaps module specifiers for virtual ids resolved from the project root                       |
| `plugin_data`                                            | yes                            | nothing                                                                   | the `?data` query                                                                            |
| source maps                                              | partly                         | `sourcemap: true` and `mappings_to_v3` from `@mdsvex/render/sourcemap`    | the chain from JS back to markdown                                                           |

Cannot be used at all without the Vite plugin today:

1. `?metadata` and `?data` imports. The functions that build those modules are pure but are not exported.
2. `links.base: true`. Compile throws; a string or an import works.
3. The editor manifest. The writer is not exported, and the fallback is a hand-written `mdsvex.config.json` that cannot hold functions.
4. `components` and `templates` given as module specifiers with their exports found automatically.
5. The merged `{ component, components }` template module, and a document used as a template.
6. `?template=name` on an import. The `template` compile option covers it per call.
7. Watching and hot update of any kind.

## 2. Coupling of the expected kind

Module loading and rewriting to imports, and what follows from having a dev server.

| what                                                                                                                                     | where                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `mdsvex:components`, `mdsvex:directives`, `mdsvex:template/*`, `mdsvex:plugin/*` ids, resolved from a fake `<root>/vite.config` importer | `main.ts:916-939`, the three registries, `ids.ts:30-33`            |
| the generated `\0mdsvex:template/<name>` module that merges a template with its components                                               | `template_registry.ts:278-305`                                     |
| snippet sibling ids resolved and loaded, with source maps                                                                                | `main.ts:759-844`, `snippet_modules.ts`                            |
| `?metadata` and `?data` served as `\0mdsvex:metadata:` and `\0mdsvex:data:` modules                                                      | `metadata_query.ts`                                                |
| `?template=` on an import, and `&template=false` for a document used as a template                                                       | `template_registry.ts:193-203, 391-397`                            |
| skipping `?raw`, `?url`, `?worker`, `?sharedworker` and `?svelte` requests                                                               | `ids.ts:41-46`, `main.ts:287-298`                                  |
| reading `src=` files, replacement modules and documents for queries                                                                      | `main.ts:701-717`, `export_tracker.ts:40`, `metadata_query.ts:206` |
| `addWatchFile`, `watchChange`, `hotUpdate` with the environment module graph, `server.watcher.add` for files outside the root            | `main.ts:732, 893-902, 1020-1094`, `metadata_query.ts:228-255`     |
| `config.root`, `config.base`, `config.command`, the loggers                                                                              | `main.ts:870-877`                                                  |
| `/@fs/` and root-relative urls for snippet ids                                                                                           | `main.ts:774-786`                                                  |
| `buildStart` resolving registries early, `buildEnd` flushing the manifest                                                                | `main.ts:904-914`                                                  |
| loading highlighter languages and the math renderer on first use                                                                         | `main.ts:378-423`, `plugin_highlight.ts`, `math.ts:133-156`        |

Two properties of this list are worth knowing:

- **Every runtime import of `vite` and of `node:` modules is dynamic.** The only static external import in the plugin entry is `@ampproject/remapping`. So importing `compile` from the main `mdsvex` entry works with Vite not installed (inferred: not run).
- **The emitted code is bundler-neutral in bare compile and not in the plugin.** Bare compile writes plain imports with the specifier as given. The plugin writes `mdsvex:*` ids that only a resolver understands.

## 3. Coupling beyond that

Ranked by how much it stands in the way of a host that is not Vite.

1. **The export scanner needs Vite.** `scan_exports` and `scan_exports_detail` are public exports of the main entry, and `strip_types` calls `import('vite')` for `transformWithOxc` or `transformWithEsbuild` (`scan_exports.ts:90-107`). A host that wants to turn "this module replaces these elements" into `{ specifier, names }` has to write its own scanner. Two already exist for that reason (section 4).
2. **The two-phase compile is internal.** `CompilerSession.parse`, `Parsed.needs` and `render` are marked `@internal` (`compile.ts:1822-1853`). They are what lets a host learn which files a document shows before rendering it. Without them the playground catches `SourceError('src_missing')` and compiles again (`packages/repl/src/workers/mdsvex.ts:715-733`). The async plugin design (`design/plugin-async.md`) builds on the same handle, so it has to become public for that anyway.
3. **Reaching into other plugins.** In `config` the plugin finds `vite-plugin-sveltekit-setup` by name and pushes its extensions into that plugin's `api.options.extensions`; in `configResolved` it finds `vite-plugin-svelte:config` and throws if the extensions are missing (`main.ts:851-890`). Neither name nor shape is a public contract of those packages.
4. **The source map strategy depends on how Vite and vite-plugin-svelte behave.** The pre transform returns no map on purpose so `getCombinedSourcemap()` is not thrown off, and a second plugin chains the maps and appends an inline comment because Vite ignores maps returned after the transform (`main.ts:269-278, 1100-1152`). The chaining code needs Node's `Buffer` (`sourcemap_chain.ts`, 16 uses) and is not exported, so another host chains maps itself.
5. **Dev server internals in the query modules.** `?metadata` and `?data` use `vite.isFileLoadingAllowed`, `vite.normalizePath`, `environment.config.consumer` and per-environment caches (`metadata_query.ts:146-166`). This is correct for a dev server (it is the security fix from #938) and it is Vite-only by nature. The pure half (`read_metadata`, `metadata_module`, `data_module`, `metadata_query.ts:60-107`) is not exported.
6. **Types.** The main entry's declarations reference `vite` types (`main.ts:2`), and seven of the eight plugin packages import their types from the main entry (`plugins/*/src/index.ts:1`). The same types are exported from `mdsvex/compile`; only `tabs` uses that entry. With Vite not installed a consumer of a plugin's types needs `skipLibCheck` (inferred).
7. **The manifest.** Only the plugin writes `node_modules/.mdsvex/manifest.json` (`manifest.ts:121-146`), and the editor reads it. A project without Vite gets the JSON fallback, which cannot express handlers, `select_template` or `rewrite`.

## 4. What a host that is not Vite does today

Both of these are in the repo, and neither uses the plugin.

**The playground** (`packages/repl`) imports `mdsvex/compile`, `mdsvex/highlight` and `mdsvex/math` and bundles with Rollup in the browser. Its own comment says it "does the vite plugin job" (`workers/mdsvex.ts:168`). It re-implements:

- a config reader over a JSON subset of the options (`:66-87, 169-310`);
- an export scanner, on acorn with its own type stripper (`:570-682`);
- the virtual id constants and a resolver for them (`:26-30, 557-568`, `bundler/index.ts:151-162`);
- the template and components merge, by taking the union of names (`:217-227`);
- loading of highlighter languages and the math renderer on demand (`:403-525`);
- supplying `src=` text by catch and retry (`:715-733`);
- serving snippet modules (`:713-750`).

It does not support image imports, the query imports, the manifest or hot update.

**The language tools** (`language-tools/`) call `compile` from the main entry and cannot run Vite. `language-core/src/config.ts` reads the manifest the plugin wrote, or `mdsvex.config.json`, and for the second re-implements a module resolver (`:509-637`, "never vite aliases") and an export scanner on the TypeScript AST (`:440-507`, "so it needs no vite"). `source-map/src/pfm_to_svelte.ts` retries the compile on `RunError` and `SourceError` (`:251-362`) and rewrites each `mdsvex:*` import to a real file itself.

So there are three export scanners, two resolvers for the virtual ids, two config readers and two retry ladders. A fourth host would write a fourth of each.

## 5. Recommendations

None of these is urgent on its own. Items 1 to 3 are small and stop the problem growing; the rest are worth doing when the area is next touched.

1. **Guard the compile entry.** A test that walks the static imports from `compile.ts` and fails on `vite`, `rollup`, `node:` or a Node global. Today a stray import of `./ids` would ship unnoticed.
2. **Make the two-phase compile public,** as the async plugin design needs: `parse`, what the document needs, a step that awaits plugin hooks, `render`. This is the host contract, and it removes both retry ladders.
3. **Take Vite out of the export scanner.** Let the caller pass the type stripper (the plugin passes Vite's), or strip with something already in the dependency tree. One scanner could then serve the plugin, the playground and the language tools.
4. **Export the pure halves:** the metadata and data module builders, the manifest writer, and the virtual id constants and their resolver. They are what a host re-implements first.
5. **Point the plugin packages' types at `mdsvex/compile`,** so a plugin's types do not pull in Vite's.
6. **Report mdsvex's own file inputs in `dependencies`** (the files a `src=` shows, template modules), once that list exists, so a host that is not Vite can watch them too.
7. **Leave as Vite-only, and say so in the docs:** `links.base: true`, the query imports' dev server checks, the source map chain, `?template=`, hot update.
8. **Decide about the reach into vite-plugin-svelte and SvelteKit.** It is what makes `.md` and `.svx` work with no extra config, so it is probably worth keeping, but it will break silently if either renames a plugin. A test against the installed versions would catch that.

Leftovers noticed on the way: `packages/mdsvex/rollup.config.js` is unused; `plugins/autolink` holds only a `node_modules` directory; `es-module-lexer` and `@ampproject/remapping` are regular dependencies of `mdsvex` though only the plugin uses them.

## 6. The plugin packages

| package                                    | imports `vite` | imports from `mdsvex`                                                    | ships components or CSS                    |
| ------------------------------------------ | -------------- | ------------------------------------------------------------------------ | ------------------------------------------ |
| anchors, emoji, external-links, references | no             | types only, from the main entry                                          | no                                         |
| page-data                                  | no             | types only, and a `declare module 'mdsvex'`                              | no                                         |
| steps                                      | no             | types only                                                               | `Steps.svelte`, `Step.svelte`, `steps.css` |
| tabs                                       | no             | `fence_meta` from `mdsvex/compile` at runtime, types from the main entry | three components, `tabs.css`               |
| toc                                        | no             | types only, and a `declare module 'mdsvex'`                              | `Toc.svelte`                               |

All eight are plain bundle factories and their own tests call `compile` directly. A bundle's components reach a document through an ordinary import of the bundle's `module`, and its stylesheet through a side-effect CSS import inside that module. So `steps`, `tabs` and `toc` need a bundler that enables the `svelte` export condition, compiles `.svelte` files from `node_modules` and handles a CSS import. `page-data` falls back to `process.cwd()` for its edit url when no root is given, behind a guard.

## 7. File system access

None of it is reachable from bare `compile()`.

| where                                             | what                                                                                              | when                                             |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `main.ts:701,717`                                 | reads each file a fence shows with `src=`                                                         | in `transform`                                   |
| `main.ts:782-786`                                 | `existsSync` to tell a root-relative url from a path, for a snippet id                            | in `resolveId`                                   |
| `main.ts:803-806`                                 | reads the document to recover a snippet no compile produced in this process                       | in `load`                                        |
| `export_tracker.ts:40-41`                         | reads each components, template or directives module to scan its exports                          | from the registries, in several hooks            |
| `metadata_query.ts:206-207`                       | reads the document for `?metadata` and `?data`                                                    | in `load`                                        |
| `manifest.ts:129-137`                             | writes the manifest under `node_modules/.mdsvex`                                                  | on a short timer, forced in `buildEnd`           |
| `language-core/src/config.ts:104,112,449,561,581` | reads the manifest or the JSON config, modules to scan, and `package.json` files for its resolver | in the language server and the TypeScript plugin |
| `language-server/src/index.ts:187`                | watches each config file it read                                                                  | for the server's lifetime                        |

Nothing in the parser, the renderer, the plugin packages, the playground source or the migrator touches the file system.

## 8. Since the audit

- **Export scanning:** one scanner, `read_exports` in `mdsvex/host`, takes the type stripper from its caller (#1170, #1180).
- **Config readers:** one. `read_json_config` in `mdsvex/host` reads `mdsvex.config.json` into the manifest the plugin writes, with the virtual ids the plugin gives. A host passes how it resolves a specifier and scans a module: the language tools resolve on disk and scan with TypeScript, the playground resolves in its workspace. The language tools ignore what is wrong with a config, the playground reports the first thing.
- **Virtual id resolvers:** one, `manifest_resolver` in `mdsvex/host`. The playground looks every `mdsvex:*` id up in the manifest the shared reader gave it, and serves a template with extra replacements as the module `template_module` writes, the one the plugin serves.
