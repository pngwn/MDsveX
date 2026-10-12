# Syntax highlighting: design

Status: drafted and agreed 2026-10-03 (decisions in §13). Targets `next`. §14, inline math, was added 2026-10-12 and is a draft with open decisions (§14.8).

Sources:
- Trackers #827 (highlighter pipeline), #826 (code block contents mangled), #832 (dynamic and executable code blocks), #824 (Svelte-significant characters) and #829 (custom components).
- pngwn's 2024 checklist in #588.
- About 200 related issues and PRs, linked inline below.
- Twinkleplop's docs (https://twinkleplop.pngwn.at/docs) and its source.

## 0. Where we are

On `next`:

- **There is no highlighting.** There is no option, no hook and no dependency. A fence renders as `<pre><code class="language-{info}">{escaped text}</code></pre>`.
- **The whole info string ends up in the class.** ```` ```sh title="shell" ```` renders `class="language-sh title=&quot;shell&quot;"`, which #870's own example shows.
- **Braces in code are not escaped (#839).** Svelte evaluates `{` in a code block as an expression. The entity half (#841) landed in #889. The brace half (commit `f084b62a`, local branch `p/escape-code-braces-hold`) escapes `{ }` in fence text, code spans and the info string across all five render walks. It is held back because it breaks the docs site's post-compile highlighting, so it lands with phase 2.
- **Compile is synchronous end to end.** That includes `compile()`, `CompilerSession`, the renderer, language-tools (tsserver can't await) and the REPL worker. Only the Vite plugin's `transform` can await, and it already does for template and component registries.
- **`pre` can be replaced already (#870).** The component receives `lang`, `meta`, `code` (raw source) and `children` (the default `<code>`).
- **PFM already has an inline language hint.** In `` `#!js foo()` `` the parser records the `#!js` hint as `info_start`/`info_end` on the code span. The renderer ignores it.
- **The `next` docs site highlights after compile.** It regex-matches the `<pre><code class="language-…">` that compile emits and runs refractor through `{@html}` (#869). Once braces become `&#123;` that breaks (it only un-escapes `&amp; &lt; &gt; &quot;`), so the site has to move to whatever lands here.

What legacy (0.x) did, and why most of the issue volume exists:

- **Escaping was split between mdsvex and every highlighter.** Highlighted code was emitted as `` {@html `…`} `` with Prism by default. Every highlighter had to make its output safe for a template literal inside Svelte markup, using `escapeSvelte` for `` { } ` `` and `\t \r \n`.
- **Users got that escaping wrong in many ways.** About 25 issues come from it: #117, #211, #212, #224, #379, #390, #392, #481, #492, #514, #524, #528, #636, #747.
- **Prism's UMD packaging was its own source of bugs:** #431, #484, #486, #548, #719, #734.
- **rehype plugins couldn't see `pre > code`:** #139, #304, #534, #554, #706, #737.

On `next` we start clean: there is no Prism, no `{@html}` and no remark/rehype.

## 1. Principles

1. **mdsvex owns Svelte safety.** A highlighter, whether built in or custom, returns ordinary HTML. mdsvex alone makes it safe to drop into a Svelte component. Users never escape for Svelte, and `escapeSvelte` goes away. #826 asks for exactly this: "the escaping needs to move out of the highlighter's hands".
2. **Highlighting stays compile-time and synchronous in the core.** `compile()` takes the highlighter as plain data (functions are fine) and stays pure. It does no I/O and no dynamic imports, so it still runs in a browser, a worker or the REPL. Anything async, such as loading languages or twoslash, happens once in the Vite plugin before `compile()` is called.
3. **Twinkleplop is the default, and every part of it can be replaced.** It is synchronous, pure, ESM-only and fast. Its features (directives, meta conventions, inline structure, line numbers, twoslash) map onto what the issues ask for. A custom highlighter is a single function.
4. **Highlighted output is markup, not `{@html}`.** That is what makes live expressions in code (§5) and component replacement of `pre` (§7) possible. Svelte 5 hoists static markup into one template string, so it doesn't cost size. This was the reason for #81's `{@html}`; see §4.3.
5. **Code is inert unless the author marks a piece of it as live.** The escape hatch is per expression, never per block by default. This is pngwn's long-standing objection to a block-level flag (#739): `function () { … }` has to stay escaped.
6. **Ship the twinkleplop pieces upstream, not as workarounds.** mdsvex needs two small, generic additions to twinkleplop (§8). Both are useful to any template language (Vue's `{{ }}`, Angular, Jinja), not just to us.

Snake_case for all option keys we own, as before.

## 2. Architecture

```
vite plugin (async, node)                     core compile() (sync, pure)
──────────────────────────                    ───────────────────────────
resolve highlight options                      parse → fences/code spans carry
load twinkleplop languages (once, lazily) ─┐   raw info + content
load twoslash if enabled (once)            ├──► render: for each fence/span
build the highlight config                 ┘     highlight(code, info)  ── twinkleplop path or custom fn
                                                  → make Svelte-safe (§4)
                                                  → wrap / replace pre (§7)
                                                  → live expressions + mappings (§5)
```

### 2.1 Core `compile()` option

```ts
interface CompileOptions {
  // ...existing
  highlight?: HighlightConfig | Highlighter | false;
}

// a resolved, synchronous configuration. The plugin builds one with
// `create_highlight()` from "mdsvex/highlight" (§3); compile() never imports languages.
interface HighlightConfig { /* opaque, produced by create_highlight() */ }

type Highlighter = (code: string, info: CodeInfo) => string | null | undefined;
interface CodeInfo {
  lang: string;          // "" when the fence names none
  meta: string;          // the rest of the info string, raw
  inline: boolean;       // code span vs fence
  filename?: string;
}
```

`compile()` defaults to `highlight: false`, which renders plain escaped code (§4.2). The plugin defaults to twinkleplop. That keeps the core free of twinkleplop's languages, so the REPL and #888's compile-only entry stay small and can opt in with whatever subset they load (Q2).

### 2.2 `mdsvex/highlight` subpath

The subpath is pure and synchronous apart from one async loader:

```ts
import { create_highlight, load_default_languages } from "mdsvex/highlight";

const languages = await load_default_languages(); // dynamic imports of every bundled language
const highlight = create_highlight({ languages, /* options from §3 */ });
compile(source, { highlight });
```

The plugin calls `load_default_languages()` the first time a transformed document contains a fence or a `#!` span, and awaits it once per process. Measured on twinkleplop `main`: importing all 19 built language packages takes **42 ms** and instantiating them takes 0.3 ms. That is cheap enough not to bother scanning documents for the languages they use.

## 3. Twinkleplop by default

### 3.1 Options

```ts
mdsvex({
  highlight: {
    languages: { dockerfile: "bash", ...more },  // merged over the defaults
    default_language: undefined,                 // for fences with no language
    on_unknown_language: "plain",                // "plain" (warn once per file+lang) | "throw"
    line_numbers: false,                         // site default; fence meta overrides
    annotations: undefined,                      // undefined = defaults (§3.4); false = none; or a list
    twoslash: false,                             // §3.7
    render: {},                                  // twinkleplop RenderOptions site defaults (hooks, whitespace, indent_guides…)
    parse_meta: undefined,                       // (raw, parsed) => RenderOptions, for house conventions
  },
  // or a custom highlighter (§6), or false
});
```

**Language values.** The preferred value is a twinkleplop **module namespace**, which is the "import the module and pass it in" shape:

```ts
import * as zig from "@acme/twinkleplop-zig";
highlight: { languages: { zig, zg: "zig" } }
```

mdsvex uses the module's `tokenize` factory, so it can instantiate the language with the annotation plugins (including `eval`, §5) and render through `to_html` itself. A string is an alias. A plain `(code, render) => html` function also works, but annotations and live expressions don't apply to it, because it was built without mdsvex's annotation config.

### 3.2 Defaults that should "just work"

- **Every twinkleplop language** is available, and Svelte, HTML, CSS and JS are highlighted with no setup (#228).
- **Common aliases** ship by default:
  - `js mjs cjs` → javascript
  - `ts mts cts` → typescript
  - `jsx` → tsx
  - `sh shell zsh` → bash
  - `console shell-session` → shellsession
  - `yml` → yaml
  - `md` → markdown
  - `env` → dotenv
  - `patch` → diff
  - `py` → python
  - `rs` → rust
- **Fences inside markdown blocks are highlighted.** The `markdown` language is created with the whole registry for its fence embeds and with yaml for front matter.
- **Language lookup** tries an exact match first, then the lowercased name, so `Dockerfile` and `JSON` work (#225).
- **Unknown languages render as plain text, not an error.** The output is the same twinkleplop markup with no tokens, so themes and line numbers still apply. There is one warning per file and language (#224, #719).
- **A fence with no language** renders as plain twinkleplop markup with `default_language` unset. That keeps styling uniform. With `highlight: false` it's a bare `<pre><code>`.
- **The class carries only the language**, never the meta: `language-sh` (fixes the #870 leak).

### 3.3 Fence meta

We reuse `@twinkleplop/markdown-core`'s `split_info` and `parse_meta`, so the conventions people already write keep working:

| meta | from | effect |
|---|---|---|
| `{1,3-4}`, `{1,3-4}#id` | shiki / VitePress, rehype-pretty-code | highlight lines (+ `data-highlighted-line-id`) |
| `/word/`, `/word/3-5`, `/word/#id` | shiki, rehype-pretty-code | highlight words / occurrences |
| `:line-numbers[=N]`, `:no-line-numbers`, `showLineNumbers{N}` | VitePress, rehype-pretty-code | line numbers (#458) |
| `[title]`, `title="…"` | VitePress, rehype-pretty-code | title caption |
| `caption="…"` | rehype-pretty-code | caption below |
| `twoslash` | shiki | route through twoslash (§3.7) |

The info string is never emitted as markup, so the braces in `{1,3}` are harmless. A meta range that points past the end of the fence fails the build, as markdown-core does: a stale range becomes an error instead of silently highlighting nothing. Anything no convention claims is passed to `parse_meta` and is also available to a replaced `pre` as the raw `meta` (§7).

### 3.4 Annotations (twinkleplop directives)

By default every built-in annotation plugin is enabled:

- `hl`, `em`, `focus`, `dim`
- `add`, `del`, `mod`
- `err`, `warn`, `info`
- mdsvex's own `eval` (§5)

`shiki_notation` (`// [!code ++]`) is not on by default (Q7). Content written for shiki transformers (#706) can opt in with `annotations: [...default_annotations, shiki_notation()]`; `default_annotations` is exported from `mdsvex/highlight`.

Extraction short-circuits when `[!` doesn't appear in a snippet, so enabling all of them costs nothing for ordinary code.

In mdsvex config the key is **`annotations`**, not `directives`, so it doesn't collide with mdsvex's own `:::directive` namespace (templates design §6). The docs can still call them "code directives".

### 3.5 Inline code

`` `#!ts const x = 1` `` is the PFM inline hint, and the parser already records it. It renders with twinkleplop's `structure: "inline"` as `<code class="twinkleplop twinkleplop-inline language-ts">…</code>` (#543, #554). The `twinkleplop` class is there because themes only style tokens inside `.twinkleplop`. A code span without a hint stays a plain `<code>`.

rehype-pretty-code's `` `code{:ts}` `` suffix is not accepted (Q5): one syntax is enough, and `{:ts}` reads like a Svelte expression in a `.svx` file. Inline code has no live values; `[!eval]` and the `eval` flag are fence-only.

### 3.6 Themes

Deferred (Q3). v1 injects no CSS. Users import a theme stylesheet themselves, usually once in the root layout:

```js
import "@twinkleplop/theme-github";          // light on :root, dark under .dark
// or, for prefers-color-scheme:
import "@twinkleplop/theme-github/light";
```

```css
@import "@twinkleplop/theme-github/dark" (prefers-color-scheme: dark);
```

The media-query form works because the `/dark` export defines its variables on `:root`. Twoslash users also import `@twinkleplop/twoslash/style.css`.

Missing theme CSS was a recurring support issue (#63, #243, #371, #439), so the getting-started docs lead with this step, and a plugin-injected `theme` option can be added later without changing anything else here.

### 3.7 Twoslash

This is opt-in and plugin-only, because it builds a TypeScript environment:

```ts
highlight: { twoslash: true }                 // ts, tsx, js, jsx via @twinkleplop/twoslash
highlight: { twoslash: { svelte: true } }     // also svelte via @twinkleplop/twoslash-svelte
```

Fences with `twoslash` in their meta use it. The twoslash packages are optional peer dependencies, and enabling twoslash without them installed is a clear config error. Popover text contains braces (types), so it relies on the same escaping as everything else (§4, §8).

## 4. Output contract and escaping

### 4.1 One rule

Whatever a highlighter returns, mdsvex guarantees:

- **No `{` or `}` reaches Svelte as markup syntax**, apart from live expressions (§5).
- **No `{@html}` and no template literal.** The backslash, `${` and whitespace bugs (#212, #224, #492, #524) therefore can't happen. The only escaping needed in markup is `{ }`. `<` and `&` are already the highlighter's job as an HTML producer.

There are two ways this is met:

- **The twinkleplop path:** twinkleplop's text escaper writes `&#123;` and `&#125;` in the same pass in which it escapes `<` and `&` (§8.1). There is no second pass over the output.
- **A custom highlighter:** mdsvex replaces every `{` / `}` in the returned string with `&#123;` / `&#125;`, including inside attribute values (Svelte decodes character references in static attribute text). It's one linear scan.

### 4.2 `highlight: false`

The output is `<pre><code class="language-x">` plus the escaped text from the #839 branch (`& < > " { }`). This is also what `compile()` emits by default.

### 4.3 Size and performance

I checked this with Svelte 5.57 on a 60-line highlighted TypeScript snippet:

| output | client JS | server JS |
|---|---|---|
| legacy-style `{@html "…"}` | 22,640 B | 22,473 B |
| inline markup, braces escaped | **22,008 B** | **21,076 B** |
| inline markup, 20 live `{expr}` | 23,843 B | 20,156 B |

Static markup compiles to a single hoisted `from_html` template, so inline output is slightly *smaller* than `{@html}`. The concern behind #81 doesn't apply to Svelte 5. Each live expression adds a few lines of client code, roughly two `sibling` calls and a text assignment.

Highlighting cost: twinkleplop handles a 600-character snippet in about 10 µs, and a 50 KB TypeScript file in 4.8 ms. No cache is needed in `CompilerSession`. The renderer has five walks (plain, mapped, trace, v3 and component), and the highlighted HTML is computed once per fence per compile and reused across them.

## 5. Live expressions in code: `[!eval]`

### 5.1 Problem

People want to write things like

````md
```sh
{install_command} @pkg/my-pkg
```
````

where `install_command` comes from a setting (#661, #739, #777, #832). A block-level flag can't express which braces are live:

```js
function () {                    // escaped
  console.log({ a: {some_val} }) // the outer escaped, the inner live
}                                // escaped
```

### 5.2 Design

`eval` is an annotation verb that mdsvex registers with twinkleplop. It selects a range with twinkleplop's standard argument grammar, and **inside that range every top-level balanced `{…}` group becomes a live Svelte expression tag.** Everything else in the range is highlighted and escaped as usual.

```js
function my_func() {
  console.log({ a: {some_val} }) // [!eval ="{some_val}"]
}
```

```sh
{install_command} @pkg/my-pkg # [!eval]
```

```ts
// [!eval +2]
const url = "{base_url}/api";
const key = "{public_key}";
```

The forms that matter most, all of which are standard twinkleplop arguments:

| marker | live groups |
|---|---|
| `[!eval]` | every top-level `{…}` on the marker's line |
| `[!eval +N]`, `[!eval :N..M]` | every top-level `{…}` on those lines |
| `[!eval ="{x}"]` | each occurrence of the literal `{x}` on the line |
| `[!eval ="{x}" :*]` | each occurrence anywhere in the snippet |
| `[!eval a...b]`, paired `[!eval a...]` / `[!eval ...b]` | top-level groups between anchors |

**Rules:**

- **The marker is removed.** It's a twinkleplop marker, so it disappears from the output, and a line holding only markers is dropped. Line numbers don't count it.
- **Live text is verbatim.** A live group is emitted byte for byte with no entity escaping (`{a < b}` must stay JS). It is rendered as **one** token span, so Svelte sees a single expression tag rather than `{`, `x` and `}` in three spans.
- **Brace matching** counts depth and skips JS string and template literals inside the group. If a group is unbalanced, the build fails with the marker's position.
- **Allowed tags** are expression tags `{expr}` and `{@html expr}`. Block tags (`{#if}`, `{#each}`) are a compile error in v1: they would open and close in different line spans, which Svelte can't parse.
- **One line per expression.** A live group can't span lines. Each line is its own `span.l`, and twinkleplop rejects verbatim ranges that cross a line break (pngwn/twinkleplop#158).
- **Scope:** values come from the document's scope. That means its `<script>` and its `metadata`.
- **Rendering:** at runtime the value is text, so Svelte escapes it. `{@html}` is the explicit route to markup.

**As built (phase 3, 2026-10-04):**

- The plugin uses twinkleplop's shared argument parsing, not `parse: "raw"`. `resolve_all()` in a raw plugin rejects half-open anchors, so raw parsing can't express pairs. Shared parsing resolves every form, pairs included, and hands the plugin each range. The token override (§5.3) would need raw parsing plus pair support in twinkleplop.
- An annotation plugin isn't given the source, so mdsvex sets it in a module variable around its own `tokenize` call. Markdown tokenizes its embedded fences again with offsets into the inner fence and drops their overlays, so the plugin checks that its marker really is at the offset it was given and ignores the call otherwise.
- The brace scanner passes over marker text (`[!verb …]`), so `[!eval ="{x}"]` on a line with a bare `[!eval]` adds no group from the marker itself. Blank groups (`{}`) stay text.
- A fence whose language is `eval` is a fence with no language and the flag, since CommonMark gives a fence with no language no meta.
- The rest of the fence is split into code records around each live group, rather than kept as one record that overlaps them. An overlapping non-identity record would compose with svelte2tsx's mapping of the expression and map the whole fence onto it.

### 5.3 Token type

A live group takes the type of the source token that encloses it, when the whole group sits inside one token, such as a string literal or comment. Otherwise it has no token class and inherits the block's base colour.

An explicit override is deferred (Q1). If it's added later, the two candidate forms are `[!eval ="{x}" token=string]`, which works with today's marker grammar through `parse: "raw"`, or `[!eval(token=string) ="{x}"]`, which mirrors PFM's `(k=v)` directive arguments but needs a twinkleplop grammar change. Twinkleplop's verbatim ranges already accept a `type`, so either form is a small addition.

### 5.4 Block-level `eval`

A fence can also turn on live expressions for the whole block (Q4):

````md
```sh eval
{install_command} @pkg/my-pkg
{run_command} dev
```
````

The `eval` meta flag means "`[!eval]` on every line": every top-level `{…}` group in the block is live. It works on any fence, including languages without comments (`json`, `text`) and fences with no language, where the marker form isn't available.

It is coarse by design. In brace-heavy languages, every object literal and function body would become an expression, which is exactly the problem the marker form solves. The docs say so: use the flag for commands, config snippets and prose-like blocks, and the marker for code. Unbalanced groups fail the build with the line number, as in §5.2.

### 5.5 Tooling and other surfaces

- **Source maps and language-tools.** Each live group gets its own 1:1 mapping record with full CODE capabilities. svelte2tsx then sees `some_val` as a real reference, so type errors, hover, rename and the "unused variable" check all work. The rest of the fence stays one record. language-tools runs the same highlighting path (it's microseconds), because it needs the live ranges.
- **The `code` prop.** A replaced `pre` gets `code` as display text: markers removed, elided lines dropped, and live groups interpolated as a template literal, for example ``code={`${install_command} @pkg/my-pkg`}``. A copy button then copies what the reader sees (#385).
- **Custom highlighters** don't get `eval` in v1 (Q8).

## 6. Custom highlighters

```ts
// vite.config.ts — top-level await does the async setup; the function itself is sync
import { createHighlighter } from "shiki";
const shiki = await createHighlighter({ themes: ["github-dark"], langs: ["ts", "svelte"] });

mdsvex({
  highlight: (code, { lang, meta, inline }) =>
    inline ? null : shiki.codeToHtml(code, { lang, theme: "github-dark", transformers: [/* … */] }),
});
```

- **It must be synchronous.** Async setup belongs in the config (top-level await) or a plugin-level factory, never in the per-fence call. This rules out the "async highlighter" problem space (#205, #210) without losing shiki, because shiki's `codeToHtml` is sync once the highlighter exists. Shiki transformers work this way too: #706 and #827's "tree access" ask become "use shiki's own transformer API inside your highlighter".
- **It returns ordinary HTML** for the whole block (`<pre>…`) or for an inline `<code>…`. `null` or `undefined` means "use mdsvex's plain rendering for this one".
- **It must not escape for Svelte.** mdsvex does that (§4.1). A legacy highlighter that returns `{@html …}` breaks loudly, because the braces get escaped. The migration guide covers this.
- **The output has to be well-formed markup**, because Svelte parses it. Every mainstream highlighter's output is.

## 7. Code block components

This extends templates design §5.3 now that a highlighter exists. A replaced `pre` wraps the whole `<pre>` element, which it gets as `children`:

```svelte
<!-- what mdsvex emits for a replaced pre -->
<Pre_MDSVEX lang="ts" meta={"title=\"math.ts\" {2}"} title="math.ts" code={`…`}>
  <pre class="twinkleplop language-ts has-highlight" data-language="ts"><code>…highlighted lines…</code></pre>
</Pre_MDSVEX>
```

| prop | value |
|---|---|
| `lang`, `meta` | split info string (as today) |
| `code` | display text (§5.5) |
| `title`, `caption` | from meta, when present |
| `children` | the highlighted `<pre>`, or a custom highlighter's whole output |

**Why `children` holds the `<pre>`.** Decided 2026-10-03 while implementing phase 2. Svelte 5 keeps whitespace only inside a `<pre>` or `<textarea>` it can see in the template. In component children it collapses the newline between line spans to a space and drops leading indentation, and character references don't help, because it decodes them first. Passing the `<code>` as children and the `<pre>` attributes as props would render every block on one line. Protecting each whitespace run with a literal `{"\n    "}` tag works, but it added about 10.7 KB of client JS to a 60-line block (+64%). So the `<pre>` stays in `children` and its attributes are not props. The plain (`highlight: false`) replacement has the same shape.

**Title and caption.**
- When `pre` is not replaced, a fence with a title or caption renders twinkleplop's `<figure class="twinkleplop-block">` with `figcaption`s.
- When `pre` is replaced, no figure is emitted. The component gets `title` and `caption` and decides the chrome itself: copy button, filename tab, language badge.

Example (#100, #385, #437, #496):

```svelte
<!-- #lib/markdown/Pre.svelte -->
<script>
  let { code, title, children } = $props();
</script>

<div class="code">
  {#if title}<span class="filename">{title}</span>{/if}
  <button onclick={() => navigator.clipboard.writeText(code)}>copy</button>
  {@render children()}
</div>
```

Inline highlighted code goes through the `code` replacement and gets `lang` as an extra prop. Elements that only exist in highlighter output (`span.l`, `figure`) are never replaced, in any `component_mode`.

**Meta props (#289, Q9).** Meta parts that no convention claims (§3.3) become props on a replaced `pre`:

````md
```svelte title="App.svelte" playground height=300 theme="dark"
````

gives `playground={true}`, `height="300"` and `theme="dark"`, alongside `title` from the meta conventions. The forms are `key="value"`, `key='value'`, `key=value` (string) and bare `key` (`true`). Expression values (`key={expr}`) are not supported in v1. A key that collides with a built-in prop (`lang`, `meta`, `code`, `title`, `caption`, `class`, `children`) is dropped with a warning. Meta props only apply to a replaced `pre`; a plain `<pre>` doesn't grow arbitrary attributes.

## 8. Twinkleplop changes

All of these are generic and none mention Svelte. 8.1 and 8.2 are required; 8.3 and 8.4 save mdsvex from re-deriving things twinkleplop already knows. All four have shipped (see Status at the end of this section).

### 8.1 Extra escapes (required, pngwn/twinkleplop#151)

```ts
ts(code, { escape: { "{": "&#123;", "}": "&#125;" } })
```

- **Scope.** The extra characters are encoded wherever the renderer escapes text: token text, plain text, attribute values and hook output. Twoslash popover text is included.
- **Speed.** The generator's scan table is built around `code > 62` being an immediate "no escape" exit. `{` (123) and `}` (125) break that, so the table and its upper bound should be built per configuration. The default stays on the current fast path.

### 8.2 Verbatim ranges (required, pngwn/twinkleplop#152)

The `[!eval]` plugin returns verbatim contributions:

```ts
// an annotation plugin returns
{ overlays: [{ start, end, verbatim: true, type?: "string" }] }
// and RenderOptions.overlays accepts { start, end, verbatim: true, type? } too
```

- **Rendering.** The renderer emits the range's source bytes unescaped, ignoring `escape` as well, as **one** `span.tok`. It splits the surrounding tokens at the range edges.
- **Token class.** `type` sets the span's token class. Without it, the span takes the enclosing token's type when the range lies inside a single token, and has no class otherwise.
- **Overlap.** Verbatim ranges can't overlap each other or a `hide` range. A token-mode class overlay that covers them still adds its classes, so `[!hl]` on a line with a live value still highlights the line.

### 8.3 Block parts (nice to have, pngwn/twinkleplop#153)

`to_parts(input, result, render)` returns `{ attributes, body }`, where `attributes` holds the `<pre>`'s class and attributes and `body` the `<code>…</code>` HTML.

- **Why mdsvex wants it.** It needs `attributes` and `body` separately to add plugin attributes to the `<pre>` and to leave the figure out for a `pre` replacement (§7).
- **Fallback without it.** Twinkleplop documents its block structure, so splitting at the first `<code>` and the last `</code></pre>` works.

### 8.4 Display text (nice to have, pngwn/twinkleplop#154)

`visible_text(input, result)` returns the source with marker bytes removed and elided lines dropped. This is the `code` prop (§5.5).

**Fallback without it.** mdsvex can rebuild the display text from `overlays.skip_ranges` and `elided_lines`. That ties mdsvex to twinkleplop internals.

### Status

All four shipped in `@twinkleplop/core` 0.3.0 (with `markdown-core` 0.2.0, `twoslash` 0.3.0 and `rehype` 0.2.0) on 2026-10-03. They behave as specified above, with these review follow-ups:
- `escape` also covers class names and the markdown-core fence wrappers.
- `@twinkleplop/rehype` throws if `render.escape` is set without `output: "raw"`.
- Verbatim ranges have trailing whitespace trimmed, as the main render loop does.
- `visible_text_map` provides the offset map that the `code` template literal needs (§5.5).

Two bugs found on `main` are fixed in `@twinkleplop/core` 0.3.1, which phase 3 depends on:
- **pngwn/twinkleplop#159.** A marker in a block comment left the closing `*/` or `-->` visible.
- **pngwn/twinkleplop#160.** Rendering with overlays was quadratic in overlay count.

## 9. Plugin config, all together

```ts
import { mdsvex } from "mdsvex";
import * as zig from "@acme/twinkleplop-zig";

mdsvex({
  templates: { default: "#lib/templates/Post.svelte" },
  components: "#lib/markdown/components.ts",   // may export `pre` (§7)
  highlight: {
    languages: { zig },
    line_numbers: false,
    twoslash: { svelte: true },
  },
});
```

The zero-config case is `mdsvex()`. It gives every bundled language, the default aliases, annotations including `[!eval]`, the meta conventions and `#!lang` inline code. The user imports a theme stylesheet (§3.6). There's no copy button, because that's a `pre` component (§7). A ready-made one could ship later as `@mdsvex/components`.

## 10. Legacy compatibility

| 0.x | next |
|---|---|
| `highlight: false` | `highlight: false` |
| `highlight.alias: { x: "y" }` | `highlight.languages: { x: "y" }` |
| `highlight.highlighter(code, lang, meta, filename)` (may be async, returns `{@html …}`) | `highlight: (code, { lang, meta, filename }) => html` (sync, plain HTML) |
| `highlight.optimise` | removed (§4.3) |
| `escapeSvelte` export | removed; mdsvex escapes (§4.1) |
| Prism + prism-svelte, theme CSS by hand | twinkleplop, theme CSS by hand (`@twinkleplop/theme-*`) |

`@mdsvex/migrate` rewrites `highlight: false` and `alias`. It can't safely rewrite a highlighter function, so it leaves a `// TODO(mdsvex-migrate)` comment linking to the guide and flags any `escapeSvelte` import.

## 11. What this closes

- **Contract and escaping:** #826, #117, #211, #212, #224, #379, #390, #392, #481, #492, #514, #524, #528, #636, #747. Any remaining open items are closed when this lands.
- **Pipeline:** #827. The rehype and tree-access asks are answered by annotations, meta conventions, render hooks, `pre` components and custom highlighters, and #139, #304, #554, #706 and #737 are covered by those.
- **Features:**
  - #458 (line numbers)
  - #543 (inline)
  - #100, #385, #437, #496 (code components)
  - #661, #739, #777 (interpolation)
  - #832's interpolation half
  - #210, #276 (docs)
- **Not this design:** executable and demo blocks (#52, #432, #608, #832's other half). They belong to directives (`:::example`), as pngwn has said since 2021. #838 is a 0.x fix.

## 12. Phasing

| phase | work | depends on |
|---|---|---|
| 1 | twinkleplop 8.1–8.4: done, `@twinkleplop/core` 0.3.0 | — |
| 2 | core + plugin highlighting: land the brace fix (`f084b62a`, #839); class carries `lang` only; `highlight` compile option; `mdsvex/highlight` (`create_highlight`, `load_default_languages`, aliases, case fallback, unknown → plain, meta conventions, inline `#!`, default annotations); custom highlighter + brace escaping; `pre` props and the `<pre>` as children, title/caption figure, meta props (Q9), `code` prop; plugin lazy default load and twoslash opt-in; switch the docs site off refractor | 1 |
| 3 | `[!eval]` and the `eval` fence flag: annotation plugin, brace-group matching, verbatim emit, per-expression mappings, `code` template literal via `visible_text_map`, language-tools check | 2, pngwn/twinkleplop#159 |
| 4 | docs (getting started with theme import, shiki recipe, copy-button component, annotations, live code), `@mdsvex/migrate` for `highlight`, REPL wiring | 2 (3 for the live-code docs) |

The brace fix lands in phase 2, not on its own, because it breaks the docs site's post-compile refractor step. Phase 2 replaces that step. Phases 3 and 4 can run in parallel once phase 2 merges.

## 13. Decisions and open questions

Decided 2026-10-03:

- **Q1. Live-code token override:** deferred. The verb is `eval`; tokens use the inherit rule (§5.3).
- **Q2. `compile()` highlighting by default:** no. `compile()` is slim by design; the plugin defaults to twinkleplop.
- **Q3. Default theme injection:** deferred. Users import theme CSS (§3.6).
- **Q4. Block-level `eval`:** yes, as a fence meta flag on any fence (§5.4).
- **Q7. Default annotations:** the twinkleplop built-ins plus `eval`. `shiki_notation` is opt-in (§3.4).
- **Q8. `[!eval]` for custom highlighters:** deferred.
- **Q9. Meta props:** yes, unclaimed `key=value` and bare flags become props on a replaced `pre` (§7).

- **Q5. Inline code:** PFM's `` `#!ts code` `` only; no `{:ts}` suffix and no live values in inline code (§3.5).
- **Q6. The `code` prop:** always passed to a replaced `pre`. It repeats the block's text as a JS string (13–24% of the highlighted block's size on two 40-line TypeScript samples), but it is available during SSR and is already display text. Reading `textContent` instead would pick up line numbers.

No questions are open on §0 to §12. §14 has its own.

## 14. Inline math

Built as written here, with the maintainer's picks in §14.8 all taken as the note's own. Display math shipped as the `math` fence. It has no design doc of its own, and it is rendered by the highlight run this document describes, so the inline form is specified here. The syntax was decided on 2026-10-10 (`plugins/PLUGIN_AUDIT.md` §6): a code span wrapped in dollars, and nothing else.

```md
Euler's identity, $`e^{i\pi} + 1 = 0`$, links five constants.
```

### 14.1 Where we are

- **A `math` fence goes through the highlight run.** `HighlightRun.with_math` takes a `MathRenderer`, and `block` hands it any fence whose language is `math`. The result has no `<pre>`. `comp_name` answers `math` for that fence when the run says `math === true`.
- **A `MathRenderer` already takes `{ display }`.** It is always `true` today.
- **`` `#!math x` `` is plain code, by decision.** `HighlightRun.inline` returns `null` for the hint.
- **`` $`x`$ `` is a dollar, a code span and a dollar today.**
- **`$` means nothing to the parser.** It is not in `TEXT_BREAK`, so a price in prose never leaves the text fast path.
- **A document with a math fence and no highlighter renders twice.** `escape_info` notes the fence while it renders as code, and `take_plain_math()` tells the compile to render again with a math run.

### 14.2 Grammar

Inline math is a `$`, a code span, and a `$`, with nothing between them, all on one line.

- **The code span is any code span:** one or two backticks, read as a code span is, padding included. In a table cell `\|` is a bar, as in any code span there, so the LaTeX `\|` has to be written `\Vert`.
- **The LaTeX is raw.** A leading `#!` is not a language hint inside dollars.
- **No flanking rule.** `` a$`x`$b `` is math. The backticks already mark both ends.
- **Both dollars are required, and an escaped one does not count.** Everything else is what it is today:

| source | result |
|---|---|
| `` $`x`$ `` | math |
| `` $`x` `` | a literal `$`, then a code span |
| `` `x`$ `` | a code span, then a literal `$` |
| `` \$`x`$ `` | a literal `$`, a code span, a literal `$` |
| `` $ `x`$ `` | the same: a space is not nothing |
| `$5`, `a $ b`, `$x$`, `$$x$$` | text |
| `` $$`x`$$ `` | a literal `$`, math, a literal `$` |
| `` $`x `` with no closing backtick | text, as an unclosed backtick is |

- **One line.** A code span may run over a line end; inline math may not. The decision "is this math" is made at the opening `$` by scanning to the closing `` `$ ``, and the line bounds that scan, in a fed parse too. It also keeps blockquote markers out of the LaTeX. A formula too long for a line is what the fence is for.
- **Where it is allowed:** wherever a code span is, which includes headings, table cells, link text and directive text.

### 14.3 Finding the dollar

The parser has to notice `` $` `` without slowing down prose that has dollars in it and no math. There are two ways.

**A. `$` joins `TEXT_BREAK`.** A text run stops at every `$`. The text state looks one character ahead: a backtick ends the text node and hands over to the inline state, anything else carries on. This is how `:` (a directive needs a letter next) and `!` (an image needs `[` next) work today.

**B. No break; look back from the backtick.** A backtick already ends a text run. When the text state stops at one, it reads the character before it, and only a `$` there starts the scan.

Both were built as throwaway stubs on `d3138024` that do the check and then fall back to text. `parity.mjs` found the output of each identical to the baseline's on all 1182 checks.

**A, measured** with `ab.mjs --suite core --repeat 2` against a private baseline of the same commit:

| mode | geomean | n |
|---|---|---|
| parse | -0.21% | 56 |
| incremental-64 | +0.19% | 30 |
| render | -0.15% | 30 |
| render-mapped | -0.11% | 30 |
| compile-mapped | +0.46% | 30 |
| sourcemap-v3 | +0.25% | 30 |
| vite-transform | +0.00% | 28 |
| overall | +0.03% | 238 |

- **Read these as "no structural cost", not as a precise zero.** Other sessions were running tests on the machine. The calibration in this checkout gave a floor of 41%, and single passes disagreed with each other by several percent per mode. The render rows are a control, since they never run the parser, and one of them read -2.0% and -4.1% in the two passes.
- **Worst rows:** `real/template-readme:compile-mapped` -11.8% (+20.5% in the other pass), `fixtures/textual_content:parse` -5.6% and -8.2%, `micro/import:render-mapped` -4.1% (+32.4% in the other pass), `micro/heading:compile-mapped` -4.0% and -4.9%.
- **One of those is real.** `fixtures/textual_content` is 52 bytes and holds the line `hello $.;'there`. It went from 505 ns to 529 ns: about 24 ns for one dollar, 41 ns by the other pass.
- **The corpus cannot show more than that.** It has 293 dollars in 4 MB, and all but 4 are inside fences and code spans, which the text fast path never reads. So the table above measures what the table entry and the extra arm in `_run` cost a document with no dollars, which is nothing that this run can see.
- **Scaled:** the real family parses at 4.3 ns a byte, so a dollar in prose costs what 6 to 10 bytes of text cost. A page with a price every 500 bytes pays 1 to 2% of its parse. A document without dollars pays nothing this run could measure.

**Both, timed again in fresh processes.** The run above was too noisy to compare the two, so the parse modes were repeated once the machine was quieter: one workload per process, the minimum of 4000 short alternating samples for each arm, and an A/A of the two baseline builds beside every row.

| workload | A/A | A, break | B, look back |
|---|---|---|---|
| 7 real documents, parse | -0.01% | -0.12% | -0.54% |
| the same, incremental-1024 | +0.01% | -0.01% | -0.10% |
| a `$` before every tenth word, 2 documents | -0.5%, +0.0% | -1.6%, -2.2% | +0.2%, -0.6% |
| every paragraph starts `$5 `, 2 documents | -0.3%, -0.4% | -1.1%, -2.2% | +0.1%, -0.3% |

- **A costs 30 to 40 ns for a dollar inside a text run and about 15 ns for one that starts a paragraph.** That agrees with the fixture row above.
- **Neither costs a document without dollars anything.** B's -0.54% is one document (`site-src-components-cheatsheet`, -2.8%, 40 ns). The other six average -0.2%, which is the spread of the A/A.

**B** costs prose with dollars nothing, and costs one character read for each backtick that ends a text run (the real family has about 480 code spans in 125 KB). Its difficulty is not speed. The `$` is already inside the open text node when the backtick is reached, so that node has to end one character short, and when the `$` is the node's only character (a paragraph or an emphasis that starts with math) the node is empty. Avoiding the empty node means every place that opens a text run checks for `` $` `` first, and that is the hot path the break table exists to keep clear.

**Recommendation: A.** It is the pattern the parser already uses twice, one table entry routes every fast path to the same place, and its cost falls only on documents full of prices, at a few tens of nanoseconds each. Before it merges, the `quick` A/B should be run again on a quiet machine to confirm the `micro/heading:compile-mapped` row is noise.

### 14.4 The node

A `code_span` whose `extra` is 1. It starts at the opening `$` and ends after the closing one, and its value is the code.

- **Why not a new kind.** A kind is added in `NodeKind`, `kind_to_string`, `repair_level`, `NODE_KIND_COUNT`, the wire's `KIND_NAMES` and its four lists of content leaves, the `K` enum and a case or a default check in each of the five walks, `comp_name`, `Node.svelte`, and `heading_ids`. A flag is read in two functions (§14.5).
- **Anything that does not know the flag shows the LaTeX as inline code.** That is the right fallback everywhere it happens: `Node.svelte`, a plugin's `code_span` handler, a heading slug (which takes the code as its text), an older wire client.
- **Why `extra` and not an attribute.** A code span leaves `extra` at 0, it travels in the wire's open op already, and reading it is one load. An attribute would allocate a metadata object for each span and would have to be added to both `INTERNAL_KEYS` lists, or it would be written out as an HTML attribute.
- **The emitter's `leaf` takes no `extra`,** so a math span is emitted as an open, a value and a close, or `leaf` gains a parameter.
- **It is never pending.** The scan in §14.2 has decided before anything is emitted, so there is nothing to revoke.

### 14.5 Rendering

```html
<span class="math math-inline" translate="no"><math>…</math></span>
```

- **The highlighter interface gets `inline_math(code, start)`.** It can't be `inline(code, 'math', start)`, which is what the `#!math` hint calls. `HighlightRun` implements it with the same `MathRenderer` and `{ display: false }`, wraps the result in the `<span>`, and makes braces safe as it does for a fence.
- **`hl_span` is the one place the walks ask.** Every walk's code span case calls it already. For a span with the flag it returns `inline_math` when the run has math, and `null` otherwise. The result has `attributes: null`, which the walks already render with no `<code>` around it. No walk changes.
- **`comp_name` answers `math`** for a flagged span when the run has math, so the `math` replacement gets inline math too. Its props are the fence's without `display` and `meta`: `children` and `code`. A `code` replacement never gets math.
- **The parser notes that it emitted a math span,** as `take_src()` notes an image. The compile reads the note before it renders and gives the renderer a math run. That avoids the second render a math fence needs when there is no highlighter. The plugin's lazy load of Temml works as it does for a fence: the pending renderer is asked, and the document compiles again once the real one has loaded.
- **Errors** are `MathError`s that name "inline math" and the line.

### 14.6 Without math, and streaming

- **With math off, it is a code span and the dollars are not shown:** `<code>e^&#123;i\pi&#125; + 1 = 0</code>`. `compile()` has math off by default, and the plugin has `math: false`. This is the fence's rule: with math off, a `math` fence is a code block. The parser does not know the option, and it should not: one grammar for every configuration is what lets the editor and the migrator agree with the compiler.
- **`Node.svelte` shows the code span.** It ignores `extra`. Rendering math there needs a renderer in the browser, which for Temml is about 400 KB that most streams never use. Later it can accept a `math` entry in its `components` map.
- **A fed parse waits at `` $` ``** for the closing dollar or the end of the line, so the reader never sees a dollar turn into math.
- **The incremental HTML renderer** renders math whenever it is given a math run.

### 14.7 Around it

- **`PFM.md`:** the "planned" paragraph becomes the grammar in §14.2.
- **GitHub and GitLab** render `` $`…`$ `` as math, so the source degrades to the same thing.
- **TextMate grammar:** one rule ahead of `#code-span`.
- **Editor:** Temml is already bundled for fences, so invalid inline LaTeX is a diagnostic the same way.
- **Plugins:** a `code_span` handler sees math spans. The node view should expose the flag.
- **`@mdsvex/migrate`:** it does nothing for math today, and its escaping damages LaTeX (`x_1^2` becomes `x\_1\^2`, and `a*b*c` loses its asterisks to emphasis). With an option that says the project used remark-math, it parses with remark-math and writes `$x$` as `` $`x`$ `` and `$$…$$` as a fence, raw. Without the option a dollar stays a dollar.

### 14.8 Decisions for the maintainer

1. **How the parser finds it.** `$` in `TEXT_BREAK` (my pick). Or the look back from the backtick, which is free for prose with dollars and leaves an empty text node to deal with (§14.3).
2. **Lines.** Inline math stays on one line (my pick). Or it may run over a line end as a code span does, which needs the node to be pending until its close and the blockquote markers stripped from the LaTeX.
3. **The node.** A `code_span` with `extra` set to 1 (my pick). Or a `math_span` kind, which is cleaner for plugins and touches every table in §14.4.
4. **With math off.** A code span without the dollars (my pick). Or the dollars shown as text around it, which is what the source looks like on a renderer with no math support.
5. **`#!` inside dollars.** Not a hint, the LaTeX is raw (my pick). Or a hinted span is never math.
6. **Streaming (D7).** `Node.svelte` shows the LaTeX as inline code and math rendering is compile only (my pick). Or a `math` component slot in `Node.svelte` now.
