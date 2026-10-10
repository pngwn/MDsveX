# Code blocks as modules: design

Status: draft, 2026-10-09. Targets `next`. Nothing here is decided yet; the open questions are in §9.

Sources:
- #832 (dynamic and executable code blocks), #52, #432, #608 (runnable and demo blocks).
- The plugin audit (`plugins/PLUGIN_AUDIT.md`): remark-code-import (156k downloads a month) and remark-sources.
- `design/syntax-highlighting.md`: fence meta conventions (§3.3), live code (§5), code block components (§7).

## 0. Where we are

- **Fence meta is read in `packages/mdsvex/src/code_meta.ts`.** `claimed()` reserves line groups, `/word/`, `twoslash`, `eval`, `:line-numbers`, `:no-line-numbers` and `showLineNumbers`. `[name]`, `title=` and `caption=` are read apart. Any other `key=value` or bare flag becomes a prop on a replaced `pre` (syntax highlighting Q9).
- **File names already have a convention.** `[math.ts]` or `title="math.ts"` names a block. Nothing reads `file=` or `src=`; today both would reach a replaced `pre` as plain props.
- **No code block runs.** `eval` makes `{…}` groups inside displayed code live against the page's scope (syntax highlighting §5). It never runs the block itself.
- **The syntax highlighting design ruled demo blocks out of scope.** §11 says executable and demo blocks "belong to directives (`:::example`)". This design keeps directives as the layout tool (§6) and adds the piece they were missing: a way to get the block's code as a module.
- **mdsvex is already a Vite plugin.** `main.ts` has `resolveId`, `load` and `hotUpdate`, and serves components and templates as virtual modules. In dev, `export_tracker().track(doc, files)` records which files a document read, and `hotUpdate` invalidates those documents when a file changes. Snippet modules and `src=` files fit the same machinery.
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

- `src=<spec>` in fence meta. `src` becomes a claimed key, so it's no longer a meta prop.
- The spec resolves like an import from the `.md` file: relative paths, Vite aliases, and `#lib/…` subpath imports.
- An optional line slice follows `#`: `#L5`, `#L5-L20`. Only the slice is displayed. A slice that falls outside the file is a compile error.
- The fence body must be empty. A non-empty body with `src=` is a compile error, so content can't silently go missing.
- A fence with `src=` and no language takes it from the file extension (`.ts` gives `ts`).
- `src=` doesn't name the block. Use `[math.ts]` or `title=` for that, as now. Open question Q3 asks whether `src=` should default the title.

Why `src` and not `file`: `src` reads like HTML's `src`, meaning "the content comes from elsewhere", and it doesn't blur with the file-name label that `title` already covers. remark-code-import uses `file=`; the migrator can rewrite it.

### 3.2 Pipeline

`compile()` can't do I/O, so the plugin does it first:

```
plugin transform (async)                           compile() (sync)
────────────────────────                           ────────────────
scan fences for src= specs (cheap parse) ─┐
this.resolve(spec, md_id) for each        ├──► sources: Map<spec, { id, text }>
read each resolved file                   ┘       → slice, highlight, render as if inline
tracker.track(md_id, [...files])                  → unresolved spec: compile error with position
```

`compile()` gets a `sources` option, which is plain data. Outside Vite, the REPL fills it from its in-memory files, and anyone calling `compile()` directly fills it themselves.

### 3.3 HMR

- **In dev:** add each resolved `src` file to `tracker.track(md_id, files)`, next to registry and template files. `hotUpdate` already invalidates `docs_using(file)`; it gains a branch for `src` files that skips the export rescan.
- **In a watch build:** `this.addWatchFile(file)`, as for registry files.
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

The query form (`guide.md?snippet=3fa9c1&lang.svelte`) is shorter, but it depends on vite-plugin-svelte's id filter accepting it. That's unverified, so the sibling path is preferred.

### 4.3 Content hashes

The id carries a hash of the block's language and raw text, not its position.

- **Editing a block changes only its own id.** The document re-transforms and emits a new import for that block. Every other block keeps its module, so it isn't re-evaluated: no repeated side effects and no repeated fetches. Old ids are simply never imported again.
- **This needs no snippet-specific `hotUpdate`.** Index-based ids would rename every block below an insertion and need explicit invalidation.
- **Identical blocks share a module.** Modules are evaluated once, but each component instance is separate, so sharing is harmless.

### 4.4 Loading

- `resolveId` recognises `*.md.snippet-<hash>.<ext>` (or whichever extensions the plugin handles) and returns it as is.
- `load` reads the snippet's text from the document's transform cache (`stored`). On a miss it re-reads and parses the document from disk and finds the block by hash. Parsing is fast, and the fallback matters because SSR, the client, cold starts and build workers can each ask for a snippet before that environment has transformed the document.
- A hash that's no longer in the document can show up during an HMR race. `load` returns an empty module that logs a warning, not an error overlay.
- `load` returns a source map into the `.md` file. Errors and stack traces from a snippet then point at the document's lines.

### 4.5 What compile emits

```svelte
<script>
  import * as __snippet_3fa9c1 from './guide.md.snippet-3fa9c1.svelte';
</script>

<Pre_MDSVEX lang="svelte" code={`…`} module={__snippet_3fa9c1}>
  <pre class="twinkleplop language-svelte">…</pre>
</Pre_MDSVEX>
```

`module` joins the built-in `pre` props (`BUILT_IN_PROPS` in `code_meta.ts`). With `src=… run`, the import is the real file and `src` is passed as a prop too.

**Without a replaced `pre`,** a run block has nowhere to go: plain markup can't run a module. Q4 asks whether that's a compile error or a sensible default.

### 4.6 Static or lazy

- **Static import** (default): the snippet takes part in SSR. That's right for Svelte demos, and the user's component can render `module.default`.
- **Lazy import** (`run=client`): compile emits `load={() => import('…')}` in place of `module`. Use this for snippets that touch `window` at module level, or for heavy demos below the fold.

## 5. The component contract

A replaced `pre` gains two props:

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

- **language-tools:** snippet ids map to ranges of the `.md` file, so the TS service could check code blocks as virtual files. That's out of scope for v1, but the id scheme shouldn't block it.
- **REPL:** implements `sources` for `src=` and the resolve/load pair for snippet ids, against its in-memory files.
- **`@mdsvex/migrate`:** rewrites remark-code-import's `file=` to `src=`. Its `#L5-L20` slice syntax already matches.

## 8. Phasing

| phase | work | depends on |
|---|---|---|
| 1 | `src=`: claimed key, slice syntax, `sources` compile option, plugin pre-scan with `this.resolve`, tracker and `hotUpdate` branch, `src` prop, errors | — |
| 2 | `run`: claimed flag, language-to-extension table, hashed sibling ids, plugin `resolveId`/`load` with cache and disk fallback, source maps, `module` prop | 1 for `src=… run`, otherwise none |
| 3 | `run=client` lazy form, REPL resolve/load, docs (demo `Pre` recipe, `:::example` recipe) | 2 |
| 4 | language-tools checking of snippet modules | 2 |

## 9. Open questions

- **Q1. The flag's name.** `run`, `exec` or `demo`? `eval` is taken. The flag also stops being a meta prop, which changes behaviour for anyone already using it as their own flag. `next` is a prerelease, so that's acceptable, but the name should be unlikely to clash.
- **Q2. Directive access to modules.** Should a container directive get the `modules` of the run blocks inside it, or should layout be left to the replaced `pre`?
- **Q3. Default title from `src=`.** Should `src=./math.ts` set `title="math.ts"` when no title is given?
- **Q4. A run block with no replaced `pre`.** Compile error, or a built-in fallback (for example rendering `module.default` for Svelte blocks)?
- **Q5. Non-script languages.** Should `css` (injects styles) and `json` run blocks be allowed?
- **Q6. Named regions.** Should slices accept `#region-name` markers in the file as well as `#L5-L20`?
- **Q7. Double parse.** The plugin's pre-scan for `src=` parses the document, then `compile()` parses it again. Should compile accept the parsed tree, or is the cost (fast parser, few documents use `src=`) not worth the API?
