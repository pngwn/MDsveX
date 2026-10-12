# Code blocks as modules: design

Status: draft, 2026-10-09. Corrected against the Vite plugin and renderer code on 2026-10-10. `src=` (§3, phases 0 and 1) was built on 2026-10-12, and §3 describes it as built. `run` (§4 on) is still a draft; its open questions are in §9. Targets `next`.

Sources:
- #832 (dynamic and executable code blocks), #52, #432, #608 (runnable and demo blocks).
- The plugin audit (`plugins/PLUGIN_AUDIT.md`): remark-code-import (156k downloads a month) and remark-sources.
- `design/syntax-highlighting.md`: fence meta conventions (§3.3), live code (§5), code block components (§7).

## 0. Where we are

- **Fence meta is read in `packages/mdsvex/src/code_meta.ts`.** `claimed()` reserves line groups, `/word/`, `twoslash`, `eval`, `:line-numbers`, `:no-line-numbers` and `showLineNumbers`. `[name]`, `title=` and `caption=` are read apart. Any other `key=value` or bare flag becomes a prop on a replaced `pre` (syntax highlighting Q9).
- **File names already have a convention.** `[math.ts]` or `title="math.ts"` names a block. `src=` is read (§3). `file=` is not, and reaches a replaced `pre` as a plain prop.
- **No code block runs.** `eval` makes `{…}` groups inside displayed code live against the page's scope (syntax highlighting §5). It never runs the block itself.
- **The syntax highlighting design ruled demo blocks out of scope.** §11 says executable and demo blocks "belong to directives (`:::example`)". This design keeps directives as the layout tool (§6) and adds the piece they were missing: a way to get the block's code as a module.
- **mdsvex is already a Vite plugin.** `main.ts` has `resolveId`, `load` and `hotUpdate`, and serves components and templates as virtual modules. Vite 6 is the minimum since #929.
- **Its file tracking for registries doesn't cover this.** `export_tracker` only exists when `components` or `templates` are configured. `src=` files have a tracker of their own, `source_files.ts`, and a `hotUpdate` branch ahead of the registry one (§3.3).
- **A compile can stop between its parse and its render.** `CompilerSession.parse(raw, inputs)` returns a `Parsed`, `render(parsed, inputs)` and `render_into(parsed, inputs, out)` finish it, and `keep(raw, inputs, metadata)` takes the document a compile just parsed. See §3.2. The plugin's string test, `has_code`, is still its only check on the source text.
- **Imports are hoisted only when a component replacement is used.** The renderer's `hoist_begin` returns early otherwise.
- **Compile is synchronous and pure.** Anything async (resolving, reading files) happens in the plugin before `compile()` is called. That principle comes from syntax highlighting §1.2 and stays.

## 1. Principles

1. **Code that runs is a real module.** No `eval`, no `new Function`, no string templates. Snippets go through the bundler like any other file: TypeScript is compiled, Svelte is compiled, imports resolve, source maps work, and a CSP can't break it.
2. **What you see is what runs.** The displayed code and the executed module come from one source, whether that's a fence or a file.
3. **The bundler contract stays small.** `compile()` returns the snippets and emits import specifiers. Serving them is a resolve/load pair. The Vite plugin implements it, and the REPL implements it against its in-memory files, as it already does for templates. Any bundler that handles virtual modules could implement it too.
4. **Running is opt-in per block.** A fence is inert unless it's marked. This matches the "code is inert" principle in syntax highlighting §1.5.
5. **The component decides what running means.** mdsvex hands over a module. Rendering a component, calling an export, or showing console output is the job of the user's `Pre` or directive component.

## 2. Two features, one mechanism

| | `src=` (code from a file) | run flag (code that executes) |
|---|---|---|
| where the code lives | a real file on disk | the fence |
| what's displayed | the file, or a slice of it | the fence |
| module id | the real file | a virtual sibling of the `.md` file (§4) |
| HMR edge | tracked file (§3.3) plus a real import when it also runs | the virtual import |

They compose. `src=./Counter.svelte run` shows the file and runs it.

````md
```ts src=./math.ts#L5-L20 [math.ts]
```

```svelte run
<script>
  let count = $state(0);
</script>

<button onclick={() => count++}>{count}</button>
```
````

## 3. `src=`: code from a file

### 3.1 Syntax

- `src=<spec>` in fence meta. `src` is a claimed key, so it's no longer a meta prop, and it is one of the built-in `pre` props, so a bare `src` flag is dropped with a warning. A value may be quoted, `src="./my file.ts"`.
- The spec resolves like an import from the `.md` file: relative paths, Vite aliases, and `#lib/…` subpath imports. A bare `math.ts` is a package name, as it is to an import, so it does not resolve. Images read a bare path as a file beside the document; `src=` does not, so a file from a package can be shown.
- An optional line slice follows `#`: `#L5`, `#L5-L20`, and the open-ended `#L5-` and `#-L20` that remark-code-import also has. Lines count from 1. Only the slice is displayed. A slice that falls outside the file is a compile error. The slice is the last `#` of the value and only `L`, digits and dashes, so `#lib/a.ts#L5` reads as the subpath `#lib/a.ts` with a slice.
- The fence body must be empty. A non-empty body with `src=` is a compile error, so content can't silently go missing. Blank lines and quote markers are not a body.
- A fence with `src=` and no language takes it from the file name: the extension (`.ts` gives `ts`, `.d.ts` gives `ts`), or the whole name when it has none (`Dockerfile` gives `dockerfile`). The highlighter's aliases cover `mjs`, `yml` and the like. A name that is no language warns as any unknown language does.
- `src=` doesn't name the block. Use `[math.ts]` or `title=` for that, as now (Q3).
- The file's text is shown without the newline that ends it, as a fence has none after its last line. `\r\n` becomes `\n` and a byte order mark is dropped.
- Errors are a `SourceError` with a `code`, the `spec`, and a 1 based `line` and `column` of the fence: `src_spec` (no path, or a slice that is no line range), `src_body`, `src_missing` (no text for the file) and `src_slice` (lines the file does not have).

Why `src` and not `file`: `src` reads like HTML's `src`, meaning "the content comes from elsewhere", and it doesn't blur with the file-name label that `title` already covers. remark-code-import uses `file=`; the migrator can rewrite it.

### 3.2 Pipeline

`compile()` can't do I/O, so the plugin does it between two phases of the compile:

```
phase 1, sync    parse the document, with its parse plugins
                 → the src= specs it uses

async, only when there are specs
                 this.resolve(spec, md_id) for each
                 read each resolved file
                 record the files for this document (§3.3)

phase 2, sync    render with sources: Map<spec, { id, text }>
                 → slice, highlight, render as if inline
                 → unresolved spec: a typed compile error with a position
```

- **The two-phase compile exists** (2026-10-11), on `CompilerSession` in `packages/mdsvex/src/compile.ts`. What `src=` builds on:
  - **`parse(raw, inputs)` runs phase 1 and returns a `Parsed`.** It holds `raw`, `source`, `metadata` and `needs`. Parse plugins and syntax options are applied here, so the specs of a fence a plugin made are seen.
  - **A `Parsed` owns its nodes.** The session's arena goes with it and comes back when it renders, so documents that take turns still share one arena, and a document that waits on I/O is never overwritten by the next parse. The Vite plugin transforms many documents at once, and its client and SSR environments share one session.
  - **`render(parsed, inputs)` and `render_into(parsed, inputs, out)` run phase 2.** They read `inputs` again, so the plugin stores the per-document fields (`filename`, `templates`, `components`, and here `sources`) before it calls. A `Parsed` renders once.
  - **`keep(raw, inputs, metadata)` takes the document a compile just parsed.** The plugin uses it for the first document with a math fence: the render finds the renderer is not loaded, the document keeps its parse while it loads, and only renders again.
  - **`Parsed.needs` is where the specs go.** It is a list of `{ type, … }`, images and then sources, each in document order, `undefined` when there are none. `{ type: 'image', url, specifier, name }` comes from `import_images`, and `{ type: 'source', spec, start }` from `src=`, one per file, with the line and column of the first fence that names it.
  - **Finding needs must not cost a document that has none.** A scan of node kinds measured 1ns a node, 0.5 to 1% of every transform. Images avoid it: the parser's `make_meta` already branches on the key `src`, which only an image gets, so that arm sets a note (`take_src()` in `@mdsvex/parse`) and only a document with an image is walked. `src=` does the same with `take_info(source, 'src=')`. Every fence gets an `info_start` and an `info_end`, and they differ when the fence has an info string, so the `info_end` arm notes where each info string is (two numbers, up to a cap). The compile then looks for `src=` inside those ranges alone, a few characters a fence, and only a document that has it is walked. A first version noted only that a document had an info string and walked every such document, which read 4 to 6% slow on the plugin transform of every document with fenced code. A document with plugins is walked either way, since a plugin can make a fence the parser never saw.
  - **The one-call path stays.** `compile_into` does both phases in one call when nothing has to be fetched, which is how image imports work: what they need is worked out between the phases, synchronously. For `src=`, an inputs flag, `await_sources`, makes `compile_into` stop after phase 1 when a spec has no entry in `sources`. The document is then a `Parsed` in the target's `waiting` field, and the plugin reads the files and calls `render_into`. No `keep` is needed.
  - **A waiting document says whether it has math.** The plugin loads the math renderer with the first math fence a render meets, and renders that document again (§3.2 of the two-phase notes). A document that waited for files may have lost its turn on the session by then, so `Parsed.math` lets the plugin load the renderer before the one render.
  - **Public `compile()` is unchanged.** It has no two-phase form yet. The REPL fills `sources` by compiling, reading the `spec` of the `src_missing` error, and compiling again.
  - **`sources: false` turns `src=` off.** The fence then renders as written. The editor compiles this way after the first `SourceError`, since it reads no files.
- **A document with no `src=` stays synchronous.** The plugin's unit tests assert that `transform` returns no promise when nothing is async.
- **`sources` is plain data.** Outside Vite, the REPL fills it from its in-memory files, and anyone calling `compile()` directly fills it themselves.
- **The text is substituted at the renderer's `fence_text`,** which all five render walks and the highlighter read. Substituting inside the highlighter would miss the plain, unhighlighted paths. The seam is `renderer.fences`, a map from the node index of a fence to `{ text, info?, props? }`. `text` replaces the body, `info` replaces the info string (so a fence with no language can take one, and a claimed key can be kept from the highlighter), and `props` is props text a replaced `pre` gets after its own. Unset, every fence reads the source as before.
- **Source mappings need care.** A fence with `src=` has an empty source range for its body. The code maps to that empty range as one span, so nothing points past the fence. Live `{…}` groups in code from the map get no records of their own, since they have no source text to map to.
- **The highlighter sees the meta too.** twinkleplop's own meta parser receives the whole string. How it treats `src=…#L5-L20` and `run` is unchecked (Q8).

### 3.3 HMR

- **A document-to-files map of its own,** `source_files.ts`. The existing tracker is absent without registries, and its `track` overwrites a document's list. A document's entry is dropped when it compiles without a `src=`.
- **In dev:** a `hotUpdate` branch ahead of the existing early return. It skips the export rescan and invalidates every document that reads the changed file, on any content change. It runs once per environment, because the client and SSR module graphs are separate. The plugin does not call `addWatchFile` in dev: Vite would make the file an import of the document in the client graph only, and the SSR module would go stale. A file outside the root is added to the watcher.
- **In a watch build:** `this.addWatchFile(file)`, as for registry files.
- **Paths** are compared with forward slashes, on both sides. CI includes Windows.
- **When the block also runs:** the real import is an ordinary graph edge, and normal HMR propagation applies on top.

## 4. Run: snippet modules

### 4.1 Marking a block

A bare flag in fence meta marks a block. `run` is the working name. `eval` is taken by live code (§0), and Q1 covers the name. The flag is claimed, so it stops being a meta prop.

`run` and live `eval` can't share a block in v1, because `{…}` groups mean different things in each. Using both is a compile error.

### 4.2 Module id

Each run block gets an id that is a fake sibling of the document:

```
/abs/docs/guide.md.snippet-3fa9c1.svelte
```

The shape follows three rules:

- **It ends in the real extension,** so the TS and Svelte plugins transform it. The language-to-extension table covers `js`, `ts`, `jsx`, `tsx`, `svelte`, and `css`/`json` if Q5 allows them. Running a block in any other language is a compile error.
- **It has no `\0` prefix,** because other plugins skip `\0` ids by convention.
- **It sits in the document's directory,** so relative imports inside the snippet resolve the same way they would in the document.

The query form (`guide.md?snippet=3fa9c1&lang.svelte`) doesn't work. vite-plugin-svelte's id filter tests the path before the query, and mdsvex's own `matches()` strips the query, so both would take that id for the document itself. The sibling path ends in `.svelte`, which the filter accepts. That comes from reading the filter; a dev-server test should confirm it.

A snippet id must not start with `mdsvex:`. The REPL resolves every such id itself and throws on the ones it doesn't know.

### 4.3 Content hashes

The id carries a hash of the block's language and raw text, not its position.

- **Editing a block changes only its own id.** The document re-transforms and emits a new import for that block. Every other block keeps its module, so it isn't re-evaluated: no repeated side effects and no repeated fetches. Old ids are simply never imported again.
- **This needs no snippet-specific `hotUpdate`.** Index-based ids would rename every block below an insertion and need explicit invalidation.
- **Identical blocks share a module.** Modules are evaluated once, but each component instance is separate, so sharing is harmless.

### 4.4 Loading

- `resolveId` recognises `*.md.snippet-<hash>.<ext>` (or whichever extensions the plugin handles) and returns it as is.
- `load` reads the snippet's text from a per-document snippet map that `transform` fills. The plugin's existing `stored` map can't serve, because its entries are wiped after each transform. On a miss, `load` re-reads and parses the document from disk and finds the block by hash. Parsing is fast, and the fallback matters because SSR, the client, cold starts and build workers can each ask for a snippet before that environment has transformed the document.
- A hash that's no longer in the document can show up during an HMR race. `load` returns an empty module that logs a warning, not an error overlay.
- `load` returns a source map into the `.md` file. Errors and stack traces from a snippet then point at the document's lines.

### 4.5 What compile emits

```svelte
<script>
  import * as __snippet_3fa9c1 from './guide.md.snippet-3fa9c1.svelte';
</script>

<Pre_MDSVEX_G lang="svelte" code={`…`} module={__snippet_3fa9c1}>
  <pre class="twinkleplop language-svelte">…</pre>
</Pre_MDSVEX_G>
```

`module`, `load` and `src` join the built-in `pre` props (`BUILT_IN_PROPS` in `code_meta.ts`), so a meta prop with one of those names is dropped with a warning. With `src=… run`, the import is the real file and `src` is passed as a prop too.

Two renderer changes have to land first:

- **An extra-imports path.** The snippet import has to be hoisted whether or not a component replacement is used.
- **Extra props on a replaced `pre`,** on both the highlighted and the plain path.

**Without a replaced `pre`,** a run block has nowhere to go: plain markup can't run a module. Q4 asks whether that's a compile error or a sensible default.

### 4.6 Static or lazy

- **Static import** (default): the snippet takes part in SSR. That's right for Svelte demos, and the user's component can render `module.default`.
- **Lazy import** (`run=client`): compile emits `load={() => import('…')}` in place of `module`. Use this for snippets that touch `window` at module level, or for heavy demos below the fold.

## 5. The component contract

A replaced `pre` gains three props:

| prop | when | value |
|---|---|---|
| `module` | `run` | the snippet's module namespace |
| `load` | `run=client` | `() => Promise<module namespace>` |
| `src` | `src=` | the spec as written |

Example:

```svelte
<!-- #lib/markdown/Pre.svelte -->
<script>
  let { lang, module, children } = $props();
  const Demo = lang === 'svelte' ? module?.default : null;
</script>

{#if Demo}
  <div class="demo"><Demo /></div>
{/if}
{@render children()}
```

A snippet is its own module. It can't see the document's `<script>` scope, and that's deliberate isolation. To share data, the user's component passes props into `module.default`.

## 6. Directives for layout

The syntax highlighting design put demo blocks with directives (`:::example`). That still holds for layout: tabs, side-by-side preview and code, a "show code" toggle. The run flag supplies the module the directive component was missing.

````md
:::example[Counter]
```svelte run
…
```
:::
````

Q2 is how the directive component gets at the module. The simplest answer is that it doesn't: the replaced `pre` inside the directive renders the demo, and the directive wraps the layout around both. The alternative is passing a `modules` prop to a container directive with the run blocks it contains.

## 7. Tooling

- **language-tools:** snippet ids map to ranges of the `.md` file, so the TS service could check code blocks as virtual files. That's out of scope for v1, but the id scheme shouldn't block it. Until then the snippet import lines pass through language-tools untouched and TypeScript will try to resolve them (Q9).
- **Errors:** new compile errors are typed and carry a position. language-tools recovers from the errors it knows about and may lose the document on any other.
- **No change when unused:** with no `sources` and no `run` block, compile emits exactly what it does today.
- **REPL:** fills `sources` for `src=` from its in-memory files (done, relative paths only), and implements the resolve/load pair for snippet ids.
- **`@mdsvex/migrate`:** rewrites remark-code-import's `file=` to `src=` on a fence with no code. Its slice syntax, `#L5-L20`, `#L5-` and `#-L20`, already matches. A fence with `file=` and code of its own is left alone, since `src=` would make that an error. remark-code-import's `<rootDir>` prefix is not rewritten.

## 8. Phasing

| phase | work | depends on |
|---|---|---|
| 0 | groundwork: an extra-imports path in the renderer (done), fence text and `pre` props from a per-document map (done), one compile-inputs object (done), two-phase compile (done) | — |
| 1 | `src=`: claimed key, slice syntax, `sources` compile option, the phase-1 scan with `this.resolve`, the document-to-files map and `hotUpdate` branch, `src` prop, errors (done) | 0 |
| 2 | `run`: claimed flag, language-to-extension table, hashed sibling ids, plugin `resolveId`/`load` with a snippet map and disk fallback, source maps, `module` prop | 0; 1 for `src=… run` |
| 3 | `run=client` lazy form, REPL resolve/load, docs (demo `Pre` recipe, `:::example` recipe) | 2 |
| 4 | language-tools checking of snippet modules | 2 |

## 9. Open questions

- **Q1. The flag's name.** `run`, `exec` or `demo`? `eval` is taken. The flag also stops being a meta prop, which changes behaviour for anyone already using it as their own flag. `next` is a prerelease, so that's acceptable, but the name should be unlikely to clash.
- **Q2. Directive access to modules.** Should a container directive get the `modules` of the run blocks inside it, or should layout be left to the replaced `pre`?
- **Q3. Default title from `src=`.** Should `src=./math.ts` set `title="math.ts"` when no title is given? Built as no: `src=` sets no title. A replaced `pre` has the `src` prop to make one from.
- **Q4. A run block with no replaced `pre`.** Compile error, or a built-in fallback (for example rendering `module.default` for Svelte blocks)?
- **Q5. Non-script languages.** Should `css` (injects styles) and `json` run blocks be allowed?
- **Q6. Named regions.** Should slices accept `#region-name` markers in the file as well as `#L5-L20`? Built as no: line slices only. A slice that is not a line range is a `src_spec` error, so a region name can be given a meaning later without changing a document that compiles today.
- **Q7. Two-phase compile.** Answered 2026-10-11, see §3.2. Two calls on `CompilerSession`, with a handle that owns its nodes. Documents that need nothing compile in one call as before and measured no slower.
- **Q8. The highlighter and the new meta.** How does twinkleplop's meta parser treat `src=…#L5-L20` and `run`? Do they need stripping before the meta reaches it? Checked for `src=`: twinkleplop ignores it, no output change and no warning. It is stripped anyway, with the info string the fence seam supplies, so a custom highlighter and the `meta` prop of a replaced `pre` never see it either. `run` is unchecked.
- **Q9. Snippet imports in the editor.** A module declaration for snippet ids, or should language-tools drop those import lines?
