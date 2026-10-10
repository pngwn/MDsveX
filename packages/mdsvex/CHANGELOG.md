# mdsvex

## 1.0.0-next.2

### Minor Changes

- [#937](https://github.com/pngwn/MDsveX/pull/937) [`9842f87`](https://github.com/pngwn/MDsveX/commit/9842f872de3f911bbaf54a56a1529d6a1445dccc) Thanks [@pngwn](https://github.com/pngwn)! - A document imported with `?metadata` gives its frontmatter without its component. Use it to list posts, so the list does not load every page:

  ```js
  const posts = import.meta.glob('./*/+page.svx', {
  	query: '?metadata',
  	import: 'metadata',
  	eager: true,
  });
  ```

  ```js
  import { metadata } from './article.svx?metadata';
  ```

  The module exports the same `metadata` as the compiled document, also as its default export, and `frontmatter.parse` applies. A document without frontmatter exports `undefined`. In dev, editing the frontmatter updates whatever imported it, and an edit below the frontmatter does not. For TypeScript, add `mdsvex/globals` to `compilerOptions.types` to type direct imports.

- [#934](https://github.com/pngwn/MDsveX/pull/934) [`aa06e2f`](https://github.com/pngwn/MDsveX/commit/aa06e2fdd972cfef890313d15a8a22b95d31bd2e) Thanks [@pngwn](https://github.com/pngwn)! - Task lists. A list item that starts with `[ ]`, `[x]` or `[X]`, then a space and some text, is a task item. It renders with a disabled checkbox before its text, and the marker is no longer part of the text. A replaced `li` component gets a boolean `checked` prop instead of the checkbox.

  ```md
  - [ ] to do
  - [x] done
  ```

  ```html
  <li><input type="checkbox" disabled /> to do</li>
  <li><input type="checkbox" checked disabled /> done</li>
  ```

  A marker with nothing after it (`- [ ]`) or with no space after it (`- [x]done`) stays text. To start an item with those characters, escape the bracket: `- \[x] text`.

- [#939](https://github.com/pngwn/MDsveX/pull/939) [`3ca3b52`](https://github.com/pngwn/MDsveX/commit/3ca3b525050c5874ac9ff7130033fe00d0112cba) Thanks [@pngwn](https://github.com/pngwn)! - `unwrap_images`, off by default, renders a paragraph that holds only images without its `<p>`. An `img` replacement that renders a block element such as `<figure>` is then no longer inside one.

  ```js
  mdsvex({ components: '#lib/markdown.js', unwrap_images: true });
  ```

  ```md
  ![A chart](/chart.png)
  ```

  ```html
  <!-- off -->
  <p><img src="/chart.png" alt="A chart" /></p>
  <!-- on -->
  <img src="/chart.png" alt="A chart" />
  ```

  Several images in one paragraph are all unwrapped, and so is an image inside a link, which keeps its link. Any text beside the image keeps the `<p>`. It works the same in block quotes, list items, directives and HTML elements. `compile()` takes the option too, and the parser takes it as a parse option.

### Patch Changes

- [#938](https://github.com/pngwn/MDsveX/pull/938) [`a8473b4`](https://github.com/pngwn/MDsveX/commit/a8473b453958c8619744cb0d8c8c694f515961bc) Thanks [@pngwn](https://github.com/pngwn)! - A `?metadata` request to the dev server only reads documents the server may serve. The path has to end in one of the configured extensions and pass Vite's `server.fs` rules (`allow`, `deny` and `strict`), as a request for the file itself would. A document outside `server.fs.allow` that is imported with `?metadata` in the browser needs its directory added to that option. Server rendering and builds read documents as before.

- [#936](https://github.com/pngwn/MDsveX/pull/936) [`0462e67`](https://github.com/pngwn/MDsveX/commit/0462e678afdb484b031e7ddb4c7086fdee273f27) Thanks [@pngwn](https://github.com/pngwn)! - `CompilerSession` and the vite plugin keep their tree, plugin dispatcher and renderer from one document to the next when parse plugins are configured, as they already did without plugins. They are rebuilt when `parse_plugins` is a different array, so pass a new array to change the plugins.

  A plugin that keeps a `NodeView` after its document has compiled now gets an error when it uses the view once the next document has started. It would otherwise read and write the nodes of that document. `TreeBuilder.reset()` works on a builder with plugins, and resets its dispatcher.

- [#926](https://github.com/pngwn/MDsveX/pull/926) [`fc56ba8`](https://github.com/pngwn/MDsveX/commit/fc56ba892e7068b378e350c29cfb52be6c5d48b1) Thanks [@pngwn](https://github.com/pngwn)! - A document imported with `?raw`, `?url`, `?worker` or `?sharedworker` is left to Vite instead of being compiled as markdown.

- [#923](https://github.com/pngwn/MDsveX/pull/923) [`6985317`](https://github.com/pngwn/MDsveX/commit/6985317ea53b10f5cf99d6a5d6142dd6bcb31e41) Thanks [@pngwn](https://github.com/pngwn)! - The script that bare imports start is `lang="ts"` when an import is a type import or the module script is `lang="ts"`.

- [#929](https://github.com/pngwn/MDsveX/pull/929) [`19fc058`](https://github.com/pngwn/MDsveX/commit/19fc05846c53942ec53ca75baabecd02ed5da076) Thanks [@pngwn](https://github.com/pngwn)! - Vite 6 or later is required. The dev server picks up a changed component or template file through a hook that Vite 5 never calls, so on Vite 5 documents kept the old components and templates until a restart.

- Updated dependencies [[`1c5c5ef`](https://github.com/pngwn/MDsveX/commit/1c5c5ef99483ac86ac52f434fe34b9237c27f12c), [`7900bf2`](https://github.com/pngwn/MDsveX/commit/7900bf24137c24de5ff749e65bf98e5f5fa18ec9), [`0462e67`](https://github.com/pngwn/MDsveX/commit/0462e678afdb484b031e7ddb4c7086fdee273f27), [`bcb377f`](https://github.com/pngwn/MDsveX/commit/bcb377f43e310fee0f1280c0e509a81fc109c532), [`7900bf2`](https://github.com/pngwn/MDsveX/commit/7900bf24137c24de5ff749e65bf98e5f5fa18ec9), [`7900bf2`](https://github.com/pngwn/MDsveX/commit/7900bf24137c24de5ff749e65bf98e5f5fa18ec9), [`bcb377f`](https://github.com/pngwn/MDsveX/commit/bcb377f43e310fee0f1280c0e509a81fc109c532), [`6985317`](https://github.com/pngwn/MDsveX/commit/6985317ea53b10f5cf99d6a5d6142dd6bcb31e41), [`bcb377f`](https://github.com/pngwn/MDsveX/commit/bcb377f43e310fee0f1280c0e509a81fc109c532), [`bcb377f`](https://github.com/pngwn/MDsveX/commit/bcb377f43e310fee0f1280c0e509a81fc109c532), [`bcb377f`](https://github.com/pngwn/MDsveX/commit/bcb377f43e310fee0f1280c0e509a81fc109c532), [`0462e67`](https://github.com/pngwn/MDsveX/commit/0462e678afdb484b031e7ddb4c7086fdee273f27), [`0462e67`](https://github.com/pngwn/MDsveX/commit/0462e678afdb484b031e7ddb4c7086fdee273f27), [`bcb377f`](https://github.com/pngwn/MDsveX/commit/bcb377f43e310fee0f1280c0e509a81fc109c532), [`aa06e2f`](https://github.com/pngwn/MDsveX/commit/aa06e2fdd972cfef890313d15a8a22b95d31bd2e), [`6985317`](https://github.com/pngwn/MDsveX/commit/6985317ea53b10f5cf99d6a5d6142dd6bcb31e41), [`7900bf2`](https://github.com/pngwn/MDsveX/commit/7900bf24137c24de5ff749e65bf98e5f5fa18ec9), [`3ca3b52`](https://github.com/pngwn/MDsveX/commit/3ca3b525050c5874ac9ff7130033fe00d0112cba), [`cc7aef8`](https://github.com/pngwn/MDsveX/commit/cc7aef8c239cfc876e80fc9340a1fb8e56818e4d), [`bcb377f`](https://github.com/pngwn/MDsveX/commit/bcb377f43e310fee0f1280c0e509a81fc109c532), [`bcb377f`](https://github.com/pngwn/MDsveX/commit/bcb377f43e310fee0f1280c0e509a81fc109c532), [`cc7aef8`](https://github.com/pngwn/MDsveX/commit/cc7aef8c239cfc876e80fc9340a1fb8e56818e4d)]:
  - @mdsvex/parse@1.0.0-next.2
  - @mdsvex/render@1.0.0-next.2

## 1.0.0-next.1

### Minor Changes

- [#866](https://github.com/pngwn/MDsveX/pull/866) [`60da683`](https://github.com/pngwn/MDsveX/commit/60da68313df11747bdd6235dffc325c30af60cb2) Thanks [@pngwn](https://github.com/pngwn)! - Import statements at the top of a document are kept. They go into the document's instance `<script>`, or into a new `<script>` when there is none.

  ```md
  import Chart from './Chart.svelte'

  <Chart />
  ```

- [#888](https://github.com/pngwn/MDsveX/pull/888) [`c81604f`](https://github.com/pngwn/MDsveX/commit/c81604f77f7e2662f42db2dcfb1c2a29a594e726) Thanks [@pngwn](https://github.com/pngwn)! - Add a `mdsvex/compile` entry point that holds only the compiler: `compile`, `CompilerSession`, the errors it throws and its option and result types. It never imports Vite, `es-module-lexer` or Node builtins, even lazily, so a browser or worker bundle needs no config to leave them out.

  ```js
  import { compile } from 'mdsvex/compile';

  const { code } = compile('# Hello');
  ```

  The root `mdsvex` entry is unchanged and still exports everything, including the Vite plugin.

- [#887](https://github.com/pngwn/MDsveX/pull/887) [`ffaf805`](https://github.com/pngwn/MDsveX/commit/ffaf805cd7ac2ebb07c1b5a33896c36e53dc6c67) Thanks [@pngwn](https://github.com/pngwn)! - `compile()` takes `strict_directives: false` to render a directive with no component as its children instead of throwing, which suits previews and editors.

  ```ts
  compile(':::note[x]\nbody\n:::', { strict_directives: false }); // <p>body</p>
  ```

- [#873](https://github.com/pngwn/MDsveX/pull/873) [`69b6c62`](https://github.com/pngwn/MDsveX/commit/69b6c624256f1e8fb1cf8e5f348980a043f2c1db) Thanks [@pngwn](https://github.com/pngwn)! - `component_mode: 'all'` now replaces HTML you type as well as elements written in markdown:

  ```ts
  mdsvex({ components: '#lib/markdown.ts', component_mode: 'all' });
  ```

  A lowercase element such as `<h2>` or `<img>` uses the same replacement as its markdown form, and a custom tag such as `<warning>` uses a `warning` export, so a components module can provide tags that work in every document without imports. Attributes pass through as props exactly as written, including `{expr}`, `{shorthand}`, `{...spread}` and `{@attach}`. A typed `h1` to `h6` gets `level`, and an `ol` without `start` gets `start={1}`. Children arrive as `children`, and void elements get none.

  `<svelte:*>` tags and capitalised components are never replaced, so `<svelte:element this="img">` renders a plain element. An element with a directive (`bind:`, `on:`, `use:`, `class:`, `style:`, `transition:`, `in:`, `out:`, `animate:` or `let:`) stays an element, because a component can't take one. The compiler warns about it, and `compile()` returns the warning in `warnings`.

- [#870](https://github.com/pngwn/MDsveX/pull/870) [`fa297f9`](https://github.com/pngwn/MDsveX/commit/fa297f9b3fda7cc11c3f4274ba0b0cc27acedf9a) Thanks [@pngwn](https://github.com/pngwn)! - Elements written in markdown can be replaced with your own Svelte components. Point the `components` option at one or more modules, and each export named after an element replaces that element:

  ```ts
  // vite.config.ts
  mdsvex({ components: '#lib/markdown.ts' });
  ```

  ```ts
  // src/lib/markdown.ts
  export { default as h2 } from './Heading.svelte';
  export { default as img } from './Image.svelte';
  ```

  Specifiers resolve the way an import from the Vite root would, so aliases, package exports and `#lib/...` subpath imports work, as does `new URL('./markdown.ts', import.meta.url)`. A `.svelte` module works too, and its `<script module>` exports are the replacements.

  Only elements produced by markdown syntax or by parse plugins are replaced. HTML you type yourself stays as it is. A replacement gets the element's attributes as props, plus `children` unless the element is void (`img`, `hr`, `br`). Some elements also get extra props:
  - `h1` to `h6` get `level`.
  - `pre` gets `lang`, `meta` and the raw `code`.
  - `ol` gets `start`.
  - `li` gets `checked`, when a plugin sets it.
  - `th` and `td` get `align`.

  Each document imports only the components it uses. When a module's export names change, the dev server recompiles the documents that use it.

- [#874](https://github.com/pngwn/MDsveX/pull/874) [`311902d`](https://github.com/pngwn/MDsveX/commit/311902de7c606430e3899440d37def14f5190b6c) Thanks [@pngwn](https://github.com/pngwn)! - Generic directives now render as your own Svelte components. A components module declares its directives with a `directives` namespace export. Directives are a separate namespace from element replacements, so a `table` export never serves `:::table`:

  ```ts
  // src/lib/markdown.ts, passed as mdsvex({ components: '#lib/markdown.ts' })
  export { default as img } from './Image.svelte';
  export * as directives from './directives.ts';
  ```

  ```ts
  // src/lib/directives.ts
  export { default as Callout } from './Callout.svelte';
  export { default as abbr } from './Abbr.svelte';
  ```

  Here is what each directive passes to its component:
  - **Args** arrive as string props.
  - **Leaf and container text** in the brackets arrives as a `label` snippet.
  - **Inline directive text** arrives as `children`.
  - **A container's body** arrives as `children`.

  So `:::Callout[Heads up](kind=warn)` passes `kind="warn"`, a `label` snippet and the body as `children`.

  A directive with no component is passed to parse plugins' `directive_inline`, `directive_leaf` and `directive_container` handlers. If none of them replaces it, the compile fails with a `DirectiveError` that names the directive and its line. Before this change, an unhandled directive rendered as its children and a leaf directive disappeared. A directive with a component never reaches a plugin's directive handlers.

- [#887](https://github.com/pngwn/MDsveX/pull/887) [`ffaf805`](https://github.com/pngwn/MDsveX/commit/ffaf805cd7ac2ebb07c1b5a33896c36e53dc6c67) Thanks [@pngwn](https://github.com/pngwn)! - The editor now knows your templates, replacement components and directives. The Vite plugin writes what it resolved to `node_modules/.mdsvex/manifest.json` and the editor reads it, falling back to an `mdsvex.config.json` like the playground's:

  ```json
  {
  	"templates": { "docs": "#lib/templates/Docs.svelte" },
  	"components": "#lib/markdown.ts"
  }
  ```

  Hovering a replaced element or directive shows its component, and go to definition opens it. The frontmatter `template` key is typed as your template names or `false`. Completions offer template names, the template's props as frontmatter keys and their literal values, and a directive's props as args with their values. Directive args and the frontmatter of a templated document are type-checked against the component's props, and `metadata` is typed by the same YAML parser `compile()` uses. Compile errors such as an unknown template show on their line, and `.svx` files are supported alongside `.pfm`.

- [#895](https://github.com/pngwn/MDsveX/pull/895) [`57ecb44`](https://github.com/pngwn/MDsveX/commit/57ecb446b292a3406dcf62550986ed15e1aa2b80) Thanks [@pngwn](https://github.com/pngwn)! - The editor reads live expressions in code as references, so type errors, hover, rename and the unused check work on them. It highlights code as the Vite plugin does unless the plugin renders code plain, and `mdsvex.config.json` takes `highlight: false`. A half-typed live expression is an error on that fence rather than on the whole document.

- [#899](https://github.com/pngwn/MDsveX/pull/899) [`1219ceb`](https://github.com/pngwn/MDsveX/commit/1219ceb0c6805ac8b169dadb13694f354d96a619) Thanks [@pngwn](https://github.com/pngwn)! - Tables can have header columns and merged cells. A `||` in the delimiter row, matched by an empty `||` cell in the header row, turns the columns on its narrower side into row headers, and two `||` give headers on both sides. A cell holding only `>` merges into the cell to its left, and a cell holding only `^` merges into the cell above. Merged cells must form rectangles, and a marker that can't merge stays text.

  ```md
  | maybe || title |> |
  |-------||-------|---|
  | hello || text | b |
  |^ || more | c |
  ```

- [#872](https://github.com/pngwn/MDsveX/pull/872) [`045aca9`](https://github.com/pngwn/MDsveX/commit/045aca94077183b8b58bb59c45813f0aa4f33cde) Thanks [@pngwn](https://github.com/pngwn)! - Frontmatter becomes the document's metadata. The compiled component exports it from its `<script module>` as `metadata`, and `compile()` returns it as `metadata`. When the document already has a module script, the export goes into that script.

  ```md
  ---
  title: Hello
  tags: [svelte, markdown]
  ---
  ```

  ```svelte
  <script module>
  export const metadata = {"title":"Hello","tags":["svelte","markdown"]};
  </script>
  ```

  mdsvex parses the YAML that frontmatter commonly holds: strings, numbers, booleans, null, nested maps, block and flow sequences, `|` and `>` blocks and comments. Dates stay strings. Anything else, such as anchors or tags, fails with an error naming the line. For full YAML, pass a parser:

  ```js
  import { parse } from 'yaml';

  mdsvex({ frontmatter: { parse } });
  ```

- [#892](https://github.com/pngwn/MDsveX/pull/892) [`59bbad3`](https://github.com/pngwn/MDsveX/commit/59bbad3d1905ea378b8745d916af0dca3e63b042) Thanks [@pngwn](https://github.com/pngwn)! - `mdsvex/highlight` exports `language_loaders`, which loads each bundled twinkleplop language on its own, so a browser `compile` only fetches the languages it uses. It also re-exports `shiki_notation`, for content written with Shiki's `// [!code ++]` markers:

  ```js
  import {
  	create_highlight,
  	default_annotations,
  	language_loaders,
  	shiki_notation,
  } from 'mdsvex/highlight';

  const highlight = create_highlight({
  	languages: { svelte: await language_loaders.svelte() },
  	annotations: [...default_annotations, shiki_notation()],
  });
  ```

- [#895](https://github.com/pngwn/MDsveX/pull/895) [`57ecb44`](https://github.com/pngwn/MDsveX/commit/57ecb446b292a3406dcf62550986ed15e1aa2b80) Thanks [@pngwn](https://github.com/pngwn)! - Code blocks can hold live Svelte expressions. An `[!eval]` comment makes every top-level `{...}` group in its range live, and everything else stays text:

  ````md
  ```sh
  {install_command} @pkg/my-pkg # [!eval]
  ```

  ```js
  function my_func() {
  	console.log({ a: { some_val } }); // [!eval ="{some_val}"]
  }
  ```
  ````

  `[!eval]` takes every twinkleplop argument form: bare for its own line, `+N`, `:N..M`, `="{x}"` with an optional `:*`, anchors and pairs. It is on by default and part of `default_annotations`. Values come from the document's script and `metadata` and render as text, so use `{@html}` for markup. A group that doesn't close on its line, or a block tag such as `{#if}`, fails the build with its line and column.

  The `eval` fence flag means `[!eval]` on every line, on any fence, including ` ```eval ` for a fence with no language. It suits commands and config rather than brace-heavy code. A custom highlighter doesn't support it yet and warns.

  A replaced `pre` gets `code` as a template literal with the live values in it, such as ``code={`${install_command} @pkg/my-pkg`}``, so a copy button copies what the reader sees. Each live expression gets its own source mapping.

- [#868](https://github.com/pngwn/MDsveX/pull/868) [`4927fd8`](https://github.com/pngwn/MDsveX/commit/4927fd87ef00ae106f081cf4315e425ec71a790c) Thanks [@pngwn](https://github.com/pngwn)! - With SvelteKit 3, the `mdsvex()` Vite plugin registers its extensions with SvelteKit, so they no longer need repeating in `sveltekit({ extensions })`.

  ```js
  export default defineConfig({
  	plugins: [mdsvex({ extensions: ['.svx'] }), sveltekit()],
  });
  ```

  Without SvelteKit, the build fails with an error naming the missing extensions until they are added to `svelte({ extensions })`.

- [#866](https://github.com/pngwn/MDsveX/pull/866) [`60da683`](https://github.com/pngwn/MDsveX/commit/60da68313df11747bdd6235dffc325c30af60cb2) Thanks [@pngwn](https://github.com/pngwn)! - A top level `<script>` with a `src` attribute, as in pasted tweet or Instagram embeds, renders as `<svelte:element this={"script"}>`. Svelte treats every top level `<script>` as the component script, so two embeds used to fail to compile.

- [#872](https://github.com/pngwn/MDsveX/pull/872) [`266f24d`](https://github.com/pngwn/MDsveX/commit/266f24d652a2bf03795b5397696790eb016890b4) Thanks [@pngwn](https://github.com/pngwn)! - The `parsePlugins` option is now `parse_plugins`, as every option mdsvex owns is snake_case.

- [#891](https://github.com/pngwn/MDsveX/pull/891) [`8ede5e2`](https://github.com/pngwn/MDsveX/commit/8ede5e2b409511978562fcec3271e7f5182789db) Thanks [@pngwn](https://github.com/pngwn)! - Fenced code and `` `#!lang code` `` spans are highlighted with [twinkleplop](https://twinkleplop.pngwn.at) by default in the Vite plugin. Every twinkleplop language loads the first time a document has code, along with the common aliases (`js`, `ts`, `sh`, `yml`, `md`, `py` and others). Lookup tries the exact name, then the lowercased one. A language mdsvex doesn't know renders as plain twinkleplop markup, with one warning per file. mdsvex adds no CSS, so import a theme yourself:

  ```js
  import '@twinkleplop/theme-github';
  ```

  ```ts
  mdsvex({
  	highlight: {
  		languages: { dockerfile: 'bash' },
  		line_numbers: false,
  		twoslash: { svelte: true },
  	},
  });
  ```

  Highlighted output is markup, not `{@html}`. Twinkleplop escapes `{` and `}` as it renders, so code never reaches Svelte as an expression. Fences accept the Shiki, VitePress and rehype-pretty-code meta conventions: `{1,3-4}`, `/word/`, `:line-numbers`, `showLineNumbers`, `[title]`, `title="..."` and `caption="..."`. A title or caption wraps the block in a `<figure>`. Twinkleplop's annotations (`// [!hl]`, `[!focus]`, `[!add]` and the rest) are on by default, and `default_annotations` is exported for extending the list. `twoslash: true` needs `@twinkleplop/twoslash`, and `{ svelte: true }` also needs `@twinkleplop/twoslash-svelte`.

  `compile()` takes a `highlight` option too. It stays synchronous and doesn't highlight by default. Build a config with `mdsvex/highlight`, which loads the languages in its only async function:

  ```js
  import { compile } from 'mdsvex/compile';
  import { create_highlight, load_default_languages } from 'mdsvex/highlight';

  const highlight = create_highlight({
  	languages: await load_default_languages(),
  });
  compile(source, { highlight, filename: 'post.svx' });
  ```

  `highlight` also takes a synchronous function, `(code, { lang, meta, inline, filename }) => html`, or `false`. A function returns ordinary HTML and mdsvex escapes every brace in it. Returning `null` renders that code plain.

  A replaced `pre` now gets the whole `<pre>` element as `children`, because Svelte only keeps whitespace inside a `<pre>` it can see. It also gets `lang`, `meta`, `code` (the text a reader sees, without annotation markers), `title`, `caption`, and a prop for each meta part no convention claims, such as `playground` or `height=300`:

  ```svelte
  <script>
  	let { code, title, children } = $props();
  </script>

  <div class="code">
  	{#if title}<span>{title}</span>{/if}
  	<button onclick={() => navigator.clipboard.writeText(code)}>copy</button>
  	{@render children()}
  </div>
  ```

  A highlighted code span goes through the `code` replacement with a `lang` prop. The `language-` class now carries only the language, never the rest of the info string.

- [#877](https://github.com/pngwn/MDsveX/pull/877) [`b35c5ff`](https://github.com/pngwn/MDsveX/commit/b35c5ff2011f9b35515edd24a11027c7a410ba56) Thanks [@pngwn](https://github.com/pngwn)! - A template can export its own `directives` namespace from its module script, the same way a components module does. For a document wrapped in that template, its directives take precedence over the root ones:

  ```svelte
  <script module>
    export * as directives from './docs-directives.ts';
  </script>
  ```

- [#876](https://github.com/pngwn/MDsveX/pull/876) [`1dceed1`](https://github.com/pngwn/MDsveX/commit/1dceed1b863e202066c943d7b3e463db7e8fdb05) Thanks [@pngwn](https://github.com/pngwn)! - Documents can be wrapped in templates, which were called layouts in mdsvex 0.x. A template is a Svelte component. It gets the frontmatter and any props passed to the document as props, and the document body as `children`:

  ```ts
  // vite.config.ts
  mdsvex({
  	templates: {
  		default: '#lib/templates/Post.svelte',
  		docs: './src/lib/templates/Docs.svelte',
  		blog: new URL('./src/Blog.svelte', import.meta.url),
  	},
  });
  ```

  ```svelte
  <!-- src/lib/templates/Post.svelte -->
  <script module>
  	export { default as h2 } from './Heading.svelte';
  </script>

  <script>
  	let { title, children } = $props();
  </script>

  <article>
  	<h1>{title}</h1>
  	{@render children()}
  </article>
  ```

  Specifiers resolve the way an import from the Vite root would, as with `components`. Element-named exports from a template's `<script module>` replace those elements in the documents it wraps, and they take precedence over the `components` modules. To add replacements to a template you can't edit, pass `{ component, components }`, and the `components` module's exports are merged over the template's own.

  mdsvex picks a document's template in this order:
  1. Frontmatter `template: false` means no template.
  2. Frontmatter `template: docs` picks that template. An unknown name is an error that lists the known names.
  3. `select_template(id, metadata)`, when given.
  4. The `default` template, when there is one.

  You can also override the template on an import, with `import Post from './post.svx?template=false'` or `?template=docs`.

  The document's `<script>`, `<script module>`, `<style>` and top level `<svelte:head>`, `<svelte:window>`, `<svelte:body>`, `<svelte:document>` and `<svelte:options>` stay outside the template. A frontmatter key named `children` is an error when the document has a template. A document that binds its own props with `let props = $props()` forwards `props` to the template. A document that destructures its props forwards nothing.

  `compile()` takes the same options as plain data, with `templates` mapping names to `{ specifier, components }`, plus `default_template` and `select_template(metadata)`. It returns the name of the template it used as `template`. When a template's export names change, the dev server recompiles the documents that used it.

### Patch Changes

- [#891](https://github.com/pngwn/MDsveX/pull/891) [`8ede5e2`](https://github.com/pngwn/MDsveX/commit/8ede5e2b409511978562fcec3271e7f5182789db) Thanks [@pngwn](https://github.com/pngwn)! - Braces in code spans, fenced code and fence info strings render as text, so Svelte no longer reads them as expressions.

  ```md
  Use `{ a: 1 }` here.
  ```

- [#893](https://github.com/pngwn/MDsveX/pull/893) [`b249bf0`](https://github.com/pngwn/MDsveX/commit/b249bf0dbbfdef330e0e78739b7d44176f9c98b9) Thanks [@pngwn](https://github.com/pngwn)! - A code span holding only `#!` or `#!lang`, with no space and code after it, renders as ordinary inline code showing that text, and never takes a language hint.

  ```md
  Write `#!ts` or `#!` in prose.
  ```

- [#879](https://github.com/pngwn/MDsveX/pull/879) [`79bebc9`](https://github.com/pngwn/MDsveX/commit/79bebc937b5c51d7fb50d06ff09f83bf23d44a87) Thanks [@pngwn](https://github.com/pngwn)! - Leaf and container directive labels now take inline markdown, as inline directive text does. A directive component's `label` snippet renders it, so `:::Callout[Heads *up*]` passes `Heads <strong>up</strong>`. Links, images and autolinks stay literal, and nothing in a label reaches past its closing `]`, so `::x[*a](k=*)` keeps `*a` as text and its args intact.

  In the parse tree the label is a `directive_label` node, the directive's first child, so a container's label stays apart from its body:

  ```
  directive_container name="Callout"
    directive_label
      text "Heads "
      strong_emphasis
        text "up"
    paragraph
      text "body"
  ```

- [#886](https://github.com/pngwn/MDsveX/pull/886) [`6c64d8b`](https://github.com/pngwn/MDsveX/commit/6c64d8b7c13c876dc03668123a9dbfcc9520b885) Thanks [@pngwn](https://github.com/pngwn)! - A `<style>` block in a document works. The vite plugin no longer compiles vite-plugin-svelte's style request for the document as markdown, which broke the build.

- [#855](https://github.com/pngwn/MDsveX/pull/855) [`98a1b87`](https://github.com/pngwn/MDsveX/commit/98a1b87b1c45f192c93bf3b910d6ebc8284b94f4) Thanks [@pngwn](https://github.com/pngwn)! - Compiling markdown is much faster, especially with source maps, and repeated one-off compiles no longer set up a new compiler each time. The vite plugin transforms markdown files many times faster and only builds the part of the source map that the Svelte output needs.

- [#862](https://github.com/pngwn/MDsveX/pull/862) [`31aa6e2`](https://github.com/pngwn/MDsveX/commit/31aa6e20390c6fa656845add1d19e0439dda48c7) Thanks [@pngwn](https://github.com/pngwn)! - Parsing, compiling, parse plugins and the vite plugin are faster for documents of every size. The largest gains are in compiles with parse plugins and in the vite plugin, where chaining the Svelte compiler's sourcemap no longer goes through a general purpose remapper.

- [#865](https://github.com/pngwn/MDsveX/pull/865) [`fd54579`](https://github.com/pngwn/MDsveX/commit/fd5457966ce23d1eb29a7935a550394adf4498e4) Thanks [@pngwn](https://github.com/pngwn)! - Parsing, incremental parsing, compiling with and without sourcemaps, parse plugins and the vite plugin are faster again for documents of every size, with the largest gains on small documents, sourcemapped compiles and Windows line endings.

- [#865](https://github.com/pngwn/MDsveX/pull/865) [`fd54579`](https://github.com/pngwn/MDsveX/commit/fd5457966ce23d1eb29a7935a550394adf4498e4) Thanks [@pngwn](https://github.com/pngwn)! - Source mappings are now objects whose `sourceOffsets`, `generatedOffsets`, `lengths` and `data` are getters. Read those properties directly; spreading a mapping no longer copies them.

  ```ts
  const copy = { ...mapping, data: other }; // before: offsets copied, now: offsets missing
  const copy = {
  	sourceOffsets: mapping.sourceOffsets,
  	generatedOffsets: mapping.generatedOffsets,
  	lengths: mapping.lengths,
  	data: other,
  };
  ```

- [#896](https://github.com/pngwn/MDsveX/pull/896) [`4c55f5e`](https://github.com/pngwn/MDsveX/commit/4c55f5eea023e687202fa97626b401f09bffd6f7) Thanks [@pngwn](https://github.com/pngwn)! - A replaced `pre` gets `title`, `caption` and meta props from the fence meta with `highlight: false` too, which is the `compile()` default, and when a highlighter returns `null` for a fence. A meta prop that collides with a built-in prop is dropped with the same warning in every mode.

  ````md
  ```ts title="math.ts" playground height=300
  const a = 1;
  ```
  ````

  gives `title={"math.ts"}`, `playground={true}` and `height={"300"}` whether or not the code is highlighted. A fence that isn't replaced still renders as a plain `<pre><code class="language-ts">` without highlighting, with no `<figure>` for its title or caption.

- [#871](https://github.com/pngwn/MDsveX/pull/871) [`2867d9b`](https://github.com/pngwn/MDsveX/commit/2867d9b0df02ae44f0475403ce62393bca4f64b9) Thanks [@pngwn](https://github.com/pngwn)! - mdsvex now ships type declarations, so TypeScript finds types for `compile`, `CompileOptions`, `mdsvex` and the other exports instead of reporting a missing declaration file. Types for `@mdsvex/render` also check under TypeScript 6.

- [#889](https://github.com/pngwn/MDsveX/pull/889) [`c56db79`](https://github.com/pngwn/MDsveX/commit/c56db798f4f43e437956bb3afb2919c09076cd6e) Thanks [@pngwn](https://github.com/pngwn)! - Character references like `&lt;`, `&copy;` and `&#123;` in text, link and image attributes render as written instead of being escaped a second time. A bare `&`, a backslash escaped `\&` and any `&` inside code are still escaped.

  ```md
  a &lt; b &copy;
  ```

- [#895](https://github.com/pngwn/MDsveX/pull/895) [`57ecb44`](https://github.com/pngwn/MDsveX/commit/57ecb446b292a3406dcf62550986ed15e1aa2b80) Thanks [@pngwn](https://github.com/pngwn)! - An annotation in a block comment, such as `/* [!hl] */` or `<!-- [!hl] -->`, now hides the whole comment, and fences with many annotations render in linear time.

- [#875](https://github.com/pngwn/MDsveX/pull/875) [`2927382`](https://github.com/pngwn/MDsveX/commit/29273823dc39bf4ab9b422210ee8acd867c29bc9) Thanks [@pngwn](https://github.com/pngwn)! - Attribute values in raw html render as written, so an entity like `&amp;` is no longer escaped a second time.

  ```md
  <div title="a &amp; b">x</div>
  ```

- [#873](https://github.com/pngwn/MDsveX/pull/873) [`69b6c62`](https://github.com/pngwn/MDsveX/commit/69b6c624256f1e8fb1cf8e5f348980a043f2c1db) Thanks [@pngwn](https://github.com/pngwn)! - Spread and attachment attributes on HTML you type, such as `<div {...rest} {@attach tooltip}>`, are no longer rendered as `...rest={...rest}`, which Svelte failed to compile.

- [#821](https://github.com/pngwn/MDsveX/pull/821) [`ed11417`](https://github.com/pngwn/MDsveX/commit/ed11417775290f85a0b14dda03d1c11d48bbd239) Thanks [@pngwn](https://github.com/pngwn)! - Files with Windows (`\r\n`) or old Mac (`\r`) line endings compile to the same HTML as their `\n` equivalents, and their sourcemaps point at the right lines and columns in the original file.

- Updated dependencies [[`cfee8d1`](https://github.com/pngwn/MDsveX/commit/cfee8d1a968ac78329e314650c51785968bf1dff), [`60da683`](https://github.com/pngwn/MDsveX/commit/60da68313df11747bdd6235dffc325c30af60cb2), [`8ede5e2`](https://github.com/pngwn/MDsveX/commit/8ede5e2b409511978562fcec3271e7f5182789db), [`b249bf0`](https://github.com/pngwn/MDsveX/commit/b249bf0dbbfdef330e0e78739b7d44176f9c98b9), [`29b6dd1`](https://github.com/pngwn/MDsveX/commit/29b6dd127efc0d00dff650d320d4d003f6d2b1b6), [`69b6c62`](https://github.com/pngwn/MDsveX/commit/69b6c624256f1e8fb1cf8e5f348980a043f2c1db), [`7815ee9`](https://github.com/pngwn/MDsveX/commit/7815ee9d0993774f6f648d46d35ce3f900a6eed4), [`db0418d`](https://github.com/pngwn/MDsveX/commit/db0418d50bcd286a062cd0b6243a234167d11781), [`fa297f9`](https://github.com/pngwn/MDsveX/commit/fa297f9b3fda7cc11c3f4274ba0b0cc27acedf9a), [`ebdb9fb`](https://github.com/pngwn/MDsveX/commit/ebdb9fb687933c69da0260eb50e8a4d2fae2bbca), [`311902d`](https://github.com/pngwn/MDsveX/commit/311902de7c606430e3899440d37def14f5190b6c), [`79bebc9`](https://github.com/pngwn/MDsveX/commit/79bebc937b5c51d7fb50d06ff09f83bf23d44a87), [`1219ceb`](https://github.com/pngwn/MDsveX/commit/1219ceb0c6805ac8b169dadb13694f354d96a619), [`98a1b87`](https://github.com/pngwn/MDsveX/commit/98a1b87b1c45f192c93bf3b910d6ebc8284b94f4), [`31aa6e2`](https://github.com/pngwn/MDsveX/commit/31aa6e20390c6fa656845add1d19e0439dda48c7), [`fd54579`](https://github.com/pngwn/MDsveX/commit/fd5457966ce23d1eb29a7935a550394adf4498e4), [`8bd14fe`](https://github.com/pngwn/MDsveX/commit/8bd14fe77aed1ff532757a06e934fa6238ecb2da), [`98a1b87`](https://github.com/pngwn/MDsveX/commit/98a1b87b1c45f192c93bf3b910d6ebc8284b94f4), [`e804671`](https://github.com/pngwn/MDsveX/commit/e804671afb412c81ce5cb38c40588257d34ab99d), [`e804671`](https://github.com/pngwn/MDsveX/commit/e804671afb412c81ce5cb38c40588257d34ab99d), [`045aca9`](https://github.com/pngwn/MDsveX/commit/045aca94077183b8b58bb59c45813f0aa4f33cde), [`2f981d8`](https://github.com/pngwn/MDsveX/commit/2f981d84b04a718dae82f79e6a9243868444f88c), [`cfee8d1`](https://github.com/pngwn/MDsveX/commit/cfee8d1a968ac78329e314650c51785968bf1dff), [`6f4a27d`](https://github.com/pngwn/MDsveX/commit/6f4a27da11241056ef4912618cefee521525a82a), [`585a698`](https://github.com/pngwn/MDsveX/commit/585a698f25fd0b6160e25bf0022e3cdabde65172), [`65c9784`](https://github.com/pngwn/MDsveX/commit/65c9784b51209c7706eebaada3e9908bda9d5fa4), [`31aa6e2`](https://github.com/pngwn/MDsveX/commit/31aa6e20390c6fa656845add1d19e0439dda48c7), [`585a698`](https://github.com/pngwn/MDsveX/commit/585a698f25fd0b6160e25bf0022e3cdabde65172), [`585a698`](https://github.com/pngwn/MDsveX/commit/585a698f25fd0b6160e25bf0022e3cdabde65172), [`98a1b87`](https://github.com/pngwn/MDsveX/commit/98a1b87b1c45f192c93bf3b910d6ebc8284b94f4), [`fd54579`](https://github.com/pngwn/MDsveX/commit/fd5457966ce23d1eb29a7935a550394adf4498e4), [`585a698`](https://github.com/pngwn/MDsveX/commit/585a698f25fd0b6160e25bf0022e3cdabde65172), [`585a698`](https://github.com/pngwn/MDsveX/commit/585a698f25fd0b6160e25bf0022e3cdabde65172), [`29b6dd1`](https://github.com/pngwn/MDsveX/commit/29b6dd127efc0d00dff650d320d4d003f6d2b1b6), [`31aa6e2`](https://github.com/pngwn/MDsveX/commit/31aa6e20390c6fa656845add1d19e0439dda48c7), [`9903c3a`](https://github.com/pngwn/MDsveX/commit/9903c3ad8d764085285486816736c4f3ea140a99), [`7e69d52`](https://github.com/pngwn/MDsveX/commit/7e69d52284e20892752041fb42726480d88cf31c), [`fd54579`](https://github.com/pngwn/MDsveX/commit/fd5457966ce23d1eb29a7935a550394adf4498e4), [`31aa6e2`](https://github.com/pngwn/MDsveX/commit/31aa6e20390c6fa656845add1d19e0439dda48c7), [`f2ff5fe`](https://github.com/pngwn/MDsveX/commit/f2ff5fe144a9009a79e0aa7a6f08f1bed5a7696c), [`57ecb44`](https://github.com/pngwn/MDsveX/commit/57ecb446b292a3406dcf62550986ed15e1aa2b80), [`fd54579`](https://github.com/pngwn/MDsveX/commit/fd5457966ce23d1eb29a7935a550394adf4498e4), [`e804671`](https://github.com/pngwn/MDsveX/commit/e804671afb412c81ce5cb38c40588257d34ab99d), [`98a1b87`](https://github.com/pngwn/MDsveX/commit/98a1b87b1c45f192c93bf3b910d6ebc8284b94f4), [`f2e4911`](https://github.com/pngwn/MDsveX/commit/f2e4911db89f7c66f684c0da839deeb3bc46fa55), [`4c55f5e`](https://github.com/pngwn/MDsveX/commit/4c55f5eea023e687202fa97626b401f09bffd6f7), [`e804671`](https://github.com/pngwn/MDsveX/commit/e804671afb412c81ce5cb38c40588257d34ab99d), [`e708e1d`](https://github.com/pngwn/MDsveX/commit/e708e1d4c66478efd8606fa2e1ff2fee40e0732a), [`2f981d8`](https://github.com/pngwn/MDsveX/commit/2f981d84b04a718dae82f79e6a9243868444f88c), [`e804671`](https://github.com/pngwn/MDsveX/commit/e804671afb412c81ce5cb38c40588257d34ab99d), [`ed11417`](https://github.com/pngwn/MDsveX/commit/ed11417775290f85a0b14dda03d1c11d48bbd239), [`98a1b87`](https://github.com/pngwn/MDsveX/commit/98a1b87b1c45f192c93bf3b910d6ebc8284b94f4), [`60da683`](https://github.com/pngwn/MDsveX/commit/60da68313df11747bdd6235dffc325c30af60cb2), [`fd54579`](https://github.com/pngwn/MDsveX/commit/fd5457966ce23d1eb29a7935a550394adf4498e4), [`2867d9b`](https://github.com/pngwn/MDsveX/commit/2867d9b0df02ae44f0475403ce62393bca4f64b9), [`60da683`](https://github.com/pngwn/MDsveX/commit/60da68313df11747bdd6235dffc325c30af60cb2), [`8ede5e2`](https://github.com/pngwn/MDsveX/commit/8ede5e2b409511978562fcec3271e7f5182789db), [`430cf34`](https://github.com/pngwn/MDsveX/commit/430cf3493575c706b31b5e02b4c219f4b6ea0569), [`eefaff5`](https://github.com/pngwn/MDsveX/commit/eefaff563e6ce05026f92c03fce21b3ba4bd5e77), [`3f5bbbb`](https://github.com/pngwn/MDsveX/commit/3f5bbbb069ca12e16b3bb96afb60c41362161109), [`60da683`](https://github.com/pngwn/MDsveX/commit/60da68313df11747bdd6235dffc325c30af60cb2), [`1dceed1`](https://github.com/pngwn/MDsveX/commit/1dceed1b863e202066c943d7b3e463db7e8fdb05), [`c56db79`](https://github.com/pngwn/MDsveX/commit/c56db798f4f43e437956bb3afb2919c09076cd6e), [`2927382`](https://github.com/pngwn/MDsveX/commit/29273823dc39bf4ab9b422210ee8acd867c29bc9), [`69b6c62`](https://github.com/pngwn/MDsveX/commit/69b6c624256f1e8fb1cf8e5f348980a043f2c1db), [`65c9784`](https://github.com/pngwn/MDsveX/commit/65c9784b51209c7706eebaada3e9908bda9d5fa4), [`585a698`](https://github.com/pngwn/MDsveX/commit/585a698f25fd0b6160e25bf0022e3cdabde65172), [`585a698`](https://github.com/pngwn/MDsveX/commit/585a698f25fd0b6160e25bf0022e3cdabde65172), [`9903c3a`](https://github.com/pngwn/MDsveX/commit/9903c3ad8d764085285486816736c4f3ea140a99), [`2f981d8`](https://github.com/pngwn/MDsveX/commit/2f981d84b04a718dae82f79e6a9243868444f88c), [`cbc0029`](https://github.com/pngwn/MDsveX/commit/cbc00291119021655765fd4f4e05d9f4fb320727), [`ed11417`](https://github.com/pngwn/MDsveX/commit/ed11417775290f85a0b14dda03d1c11d48bbd239)]:
  - @mdsvex/parse@1.0.0-next.1
  - @mdsvex/render@1.0.0-next.1

## 1.0.0-next.0

### Major Changes

- [#795](https://github.com/pngwn/MDsveX/pull/795) [`6ac3826`](https://github.com/pngwn/MDsveX/commit/6ac382615eb410230e8423d5ca4202005588869e) Thanks [@pngwn](https://github.com/pngwn)! - Add new PFM parser, renderers

### Minor Changes

- [#798](https://github.com/pngwn/MDsveX/pull/798) [`e5b7abe`](https://github.com/pngwn/MDsveX/commit/e5b7abe1ebf868b1df1e934fb96e1e363696f3e9) Thanks [@pngwn](https://github.com/pngwn)! - Add plugin system and autolink plugin

- [#799](https://github.com/pngwn/MDsveX/pull/799) [`5b54692`](https://github.com/pngwn/MDsveX/commit/5b54692d6c895f02c947ce620a46c7a9beb856e9) Thanks [@pngwn](https://github.com/pngwn)! - Add language tools

### Patch Changes

- Updated dependencies [[`6ac3826`](https://github.com/pngwn/MDsveX/commit/6ac382615eb410230e8423d5ca4202005588869e), [`46f655f`](https://github.com/pngwn/MDsveX/commit/46f655f90a838726eda34e1b07667e86fa61e7cb), [`e5b7abe`](https://github.com/pngwn/MDsveX/commit/e5b7abe1ebf868b1df1e934fb96e1e363696f3e9), [`5b54692`](https://github.com/pngwn/MDsveX/commit/5b54692d6c895f02c947ce620a46c7a9beb856e9)]:
  - @mdsvex/render@1.0.0-next.0
  - @mdsvex/parse@1.0.0-next.0

## 0.12.5

### Patch Changes

- [#714](https://github.com/pngwn/MDsveX/pull/714) [`14ad73f`](https://github.com/pngwn/MDsveX/commit/14ad73fd5c563a5ac263a9169a50ebf022d34566) Thanks [@pngwn](https://github.com/pngwn)! - Ensure that mdsvex files and layouts can contain Svelte 5 syntax.

* [#714](https://github.com/pngwn/MDsveX/pull/714) [`14ad73f`](https://github.com/pngwn/MDsveX/commit/14ad73fd5c563a5ac263a9169a50ebf022d34566) Thanks [@pngwn](https://github.com/pngwn)! - Replace process polyfill with something that isn't ridiculous

## 0.12.4

### Patch Changes

- [#692](https://github.com/pngwn/MDsveX/pull/692) [`27b40a8`](https://github.com/pngwn/MDsveX/commit/27b40a81417a743a07075eb02eb8b2f937f91140) Thanks [@ckiee](https://github.com/ckiee)! - fix(mdsvex): Ensure escaped <angle>bracket is handled correctly

* [#712](https://github.com/pngwn/MDsveX/pull/712) [`92268f4`](https://github.com/pngwn/MDsveX/commit/92268f49cf7e40cf463d283d7ecc791d222bcbcb) Thanks [@pngwn](https://github.com/pngwn)! - Allows user to disable automatic code optimisation (`@html` insertion)

- [#545](https://github.com/pngwn/MDsveX/pull/545) [`fa44d04`](https://github.com/pngwn/MDsveX/commit/fa44d0432cde153a5fe23a987b0b5cce9e961660) Thanks [@henrikvilhelmberglund](https://github.com/henrikvilhelmberglund)! - Replace hyphen in YAML frontmatter with underscore to prevent issues when building

* [#690](https://github.com/pngwn/MDsveX/pull/690) [`59e793e`](https://github.com/pngwn/MDsveX/commit/59e793e78c504bb95ab8ee40db411d2680d1ff77) Thanks [@Antosik](https://github.com/Antosik)! - Fix: Export global type definitions for .svx files

- [#709](https://github.com/pngwn/MDsveX/pull/709) [`7dd3f90`](https://github.com/pngwn/MDsveX/commit/7dd3f904afb39cf91f15db5a04442a4a1c1414c9) Thanks [@pngwn](https://github.com/pngwn)! - Ensure mdsvex works in a browser environment.

* [#656](https://github.com/pngwn/MDsveX/pull/656) [`bdb68ee`](https://github.com/pngwn/MDsveX/commit/bdb68eee6f4ed5e4fdd649cb24662329fe1032b9) Thanks [@ghostdevv](https://github.com/ghostdevv)! - fix: types in the exports map (https://github.com/pngwn/MDsveX/pull/651 https://github.com/pngwn/MDsveX/pull/656)

## 0.12.3

### Patch Changes

- [#637](https://github.com/pngwn/MDsveX/pull/637) [`9e8165f`](https://github.com/pngwn/MDsveX/commit/9e8165f981f52ef0b05cbb93335a7ac664d9e50c) Thanks [@pngwn](https://github.com/pngwn)! - fix layout path resolution

## 0.12.2

### Patch Changes

- [#630](https://github.com/pngwn/MDsveX/pull/630) [`157d9a3`](https://github.com/pngwn/MDsveX/commit/157d9a3e05ad08dfec2837828e11c19f6941f66c) Thanks [@pngwn](https://github.com/pngwn)! - Fix the builds

## 0.12.1

### Patch Changes

- [#628](https://github.com/pngwn/MDsveX/pull/628) [`b1fc10b`](https://github.com/pngwn/MDsveX/commit/b1fc10bbcc870ff57668a0627872701926070cd4) Thanks [@pngwn](https://github.com/pngwn)! - fix exports

## 0.12.0

### Minor Changes

- [#617](https://github.com/pngwn/MDsveX/pull/617) [`623b182`](https://github.com/pngwn/MDsveX/commit/623b18277b867a7b088951609710af871c9b9e56) Thanks [@benmccann](https://github.com/benmccann)! - add exports map to package.json and cleanup build output.

### Patch Changes

- [#612](https://github.com/pngwn/MDsveX/pull/612) [`91ef99f`](https://github.com/pngwn/MDsveX/commit/91ef99f9e95f6014243deadbbdcc13aac24079f8) Thanks [@moiri-gamboni](https://github.com/moiri-gamboni)! - Fix typescript module declaration to resolve errors when importing markdown files as components

## 0.11.2

### Patch Changes

- [#604](https://github.com/pngwn/MDsveX/pull/604) [`82553e0`](https://github.com/pngwn/MDsveX/commit/82553e02ab06b40a1650632865e076d0ad4d6ea4) Thanks [@pngwn](https://github.com/pngwn)! - Update peerDeps for Svelte 5

## 0.11.1

### Patch Changes

- [#596](https://github.com/pngwn/MDsveX/pull/596) [`d238325`](https://github.com/pngwn/MDsveX/commit/d2383257d959c68ea5279fd3a8d22ec6d5a4504e) Thanks [@TheOnlyTails](https://github.com/TheOnlyTails)! - Infer the settings type when using unified plugins with settings

* [#591](https://github.com/pngwn/MDsveX/pull/591) [`1ff938c`](https://github.com/pngwn/MDsveX/commit/1ff938c9e9aa588486fb57f762a5356630549288) Thanks [@vnphanquang](https://github.com/vnphanquang)! - Allow more extensive extension filtering. For example, now `.md.svelte` is possible

- [#592](https://github.com/pngwn/MDsveX/pull/592) [`68c6df2`](https://github.com/pngwn/MDsveX/commit/68c6df2e97103119a2bb048588f43d4f0fad1493) Thanks [@vnphanquang](https://github.com/vnphanquang)! - Pass filename to highlighter

* [#603](https://github.com/pngwn/MDsveX/pull/603) [`ae41002`](https://github.com/pngwn/MDsveX/commit/ae410026fb51bcdb5577c324a4e4d87323a0e57b) Thanks [@pngwn](https://github.com/pngwn)! - Update peerDependencies to allow Svelte 5

## 0.11.0

### Minor Changes

- [#522](https://github.com/pngwn/MDsveX/pull/522) [`0d690dc`](https://github.com/pngwn/MDsveX/commit/0d690dcc98358aa33a2d9a12bb5f908bbbe8e8a4) Thanks [@pngwn](https://github.com/pngwn)! - The default code highlighter is now exported, for your convenience.

* [#520](https://github.com/pngwn/MDsveX/pull/520) [`d5191b6`](https://github.com/pngwn/MDsveX/commit/d5191b64f20a93adb1845435fa0244d2d29c63b4) Thanks [@flakolefluk](https://github.com/flakolefluk)! - Support Svelte v4.

## 0.10.6

### Patch Changes

- [#450](https://github.com/pngwn/MDsveX/pull/450) [`eb10fbd`](https://github.com/pngwn/MDsveX/commit/eb10fbda2d682593083369960afc018ae8fafc45) Thanks [@GauBen](https://github.com/GauBen)! - Escape script and style tags in frontmatter

## 0.10.5

### Patch Changes

- [#409](https://github.com/pngwn/MDsveX/pull/409) [`573cabb`](https://github.com/pngwn/MDsveX/commit/573cabbb24b61390bdae2ec517807ea9b54b6aad) Thanks [@PuruVJ](https://github.com/PuruVJ)! - Add defineConfig and ambient d.ts

## 0.10.4

### Patch Changes

- [#407](https://github.com/pngwn/MDsveX/pull/407) [`7dee856`](https://github.com/pngwn/MDsveX/commit/7dee856ea2e577dae3c32b1039e26d32c1a08847) Thanks [@pngwn](https://github.com/pngwn)! - make it work

## 0.10.3

### Patch Changes

- [#405](https://github.com/pngwn/MDsveX/pull/405) [`9d98465`](https://github.com/pngwn/MDsveX/commit/9d98465dce438efd520b069ae90b75fafe0f65db) Thanks [@pngwn](https://github.com/pngwn)! - Delete globals.d.ts

* [#403](https://github.com/pngwn/MDsveX/pull/403) [`5349992`](https://github.com/pngwn/MDsveX/commit/5349992078dbc9f3116089570465aec383934432) Thanks [@pngwn](https://github.com/pngwn)! - Revert 401 feat/defineconfig

## 0.10.2

### Patch Changes

- [#401](https://github.com/pngwn/MDsveX/pull/401) [`e3d6228`](https://github.com/pngwn/MDsveX/commit/e3d6228851d1e75f073687a4f7fa4ad72fcd246b) Thanks [@PuruVJ](https://github.com/PuruVJ)! - expose types, and defineMDSveXConfig

## 0.10.1

### Patch Changes

- [#399](https://github.com/pngwn/MDsveX/pull/399) [`814e8f6`](https://github.com/pngwn/MDsveX/commit/814e8f6f712fe6499c3fb71d895fe5f4430522ab) Thanks [@PuruVJ](https://github.com/PuruVJ)! - Fix globals.d.ts location

## 0.10.0

### Minor Changes

- [#396](https://github.com/pngwn/MDsveX/pull/396) [`c0cdf71`](https://github.com/pngwn/MDsveX/commit/c0cdf71915314c3c709cb616b7822c20f2954666) Thanks [@PuruVJ](https://github.com/PuruVJ)! - Add ambient Typings

## 0.9.8

### Patch Changes

- [#274](https://github.com/pngwn/MDsveX/pull/274) [`b253bb0`](https://github.com/pngwn/MDsveX/commit/b253bb0e402d109a62f8ad33f96943672d65cc1e) Thanks [@pngwn](https://github.com/pngwn)! - Custom highlight functions now receive the metastring as an additional argument.

## 0.9.7

### Patch Changes

- [#265](https://github.com/pngwn/MDsveX/pull/265) [`d1c1b4f`](https://github.com/pngwn/MDsveX/commit/d1c1b4f0a2b70fb09d3efb5f391ca12f717a0474) Thanks [@wlach](https://github.com/wlach)! - Escape code chunks in browser builds

## 0.9.6

### Patch Changes

- [#256](https://github.com/pngwn/MDsveX/pull/256) [`492b7a4`](https://github.com/pngwn/MDsveX/commit/492b7a4ad0eaf4274bdc83e629816644e56de643) Thanks [@pngwn](https://github.com/pngwn)! - Props passed to mdsvex documents will now be forwarded to layout files.

## 0.9.5

### Patch Changes

- [#253](https://github.com/pngwn/MDsveX/pull/253) [`8dc7900`](https://github.com/pngwn/MDsveX/commit/8dc790039a6b8f5f31f3e71bfc09c8d7a968cc95) Thanks [@pngwn](https://github.com/pngwn)! - There is now an ESM browser build in addition to UMD.

## 0.9.4

### Patch Changes

- [#251](https://github.com/pngwn/MDsveX/pull/251) [`3d8b400`](https://github.com/pngwn/MDsveX/commit/3d8b40039f3b096b609cdd358f3d56f9961c63e4) Thanks [@pngwn](https://github.com/pngwn)! - UMD build now works in the browser.

## 0.9.3

### Patch Changes

- [`2af50ee`](https://github.com/pngwn/MDsveX/commit/2af50ee80aeda5ca007b1046a8bb04523963ddc9) [#239](https://github.com/pngwn/MDsveX/pull/239) Thanks [@brev](https://github.com/brev)! - Standalone compile() function not returning headmatter attributes. Also export all types.

## 0.9.2

### Patch Changes

- [`0567e15`](https://github.com/pngwn/MDsveX/commit/0567e151ea29ea531b8f71496c46871add43dcbb) [#237](https://github.com/pngwn/MDsveX/pull/237) Thanks [@pngwn](https://github.com/pngwn)! - Fix "Cannot find module 'prism-svelte'" error.

## 0.9.1

### Patch Changes

- [`f458229`](https://github.com/pngwn/MDsveX/commit/f458229033aaee7a86bbba6004053f65441ac25c) [#234](https://github.com/pngwn/MDsveX/pull/234) Thanks [@pngwn](https://github.com/pngwn)! - mdsvex now exposes an `escapeSvelte` utility to help with escaping Svelte syntax in custom highlight functions.

* [`fe9b437`](https://github.com/pngwn/MDsveX/commit/fe9b43782d3cf5ea74b13d69aa82fbf0b0db4837) [#233](https://github.com/pngwn/MDsveX/pull/233) Thanks [@pngwn](https://github.com/pngwn)! - Language definitions for fenced code-blocks are now case insensitive.

- [`8c905ce`](https://github.com/pngwn/MDsveX/commit/8c905ce380e0a8fb0b755f9b3ed23224b0ed4866) [#231](https://github.com/pngwn/MDsveX/pull/231) Thanks [@pngwn](https://github.com/pngwn)! - Svelte syntax is now highlighted by default when using the default code highlighter.

## 0.9.0

### Minor Changes

- [`99da8fe`](https://github.com/pngwn/MDsveX/commit/99da8fe17882d55ecb7ec0d5a64ee6a592fc17bc) [#207](https://github.com/pngwn/MDsveX/pull/207) Thanks [@pngwn](https://github.com/pngwn)! - User-provided remark plugins that modify code nodes now run before the builtin in code highlighting, allowing for custom code transformations.

* [`aa8d825`](https://github.com/pngwn/MDsveX/commit/aa8d825a241b02a4387e2b034038b68d76ebe1b6) [#209](https://github.com/pngwn/MDsveX/pull/209) Thanks [@pngwn](https://github.com/pngwn)! - Asynchronous custom highlight functions are now supported.

## 0.8.9

### Patch Changes

- [`a4806af`](https://github.com/pngwn/MDsveX/commit/a4806af06edf2c756a0777cb42eb73edcd12abe7) [#187](https://github.com/pngwn/MDsveX/pull/187) Thanks [@wlach](https://github.com/wlach)! - Various small fixes to compile typechecking

* [`94d5c3e`](https://github.com/pngwn/MDsveX/commit/94d5c3ed6b09565319168e1befd4ca80c4a2b2eb) [#185](https://github.com/pngwn/MDsveX/pull/185) Thanks [@wlach](https://github.com/wlach)! - Fix calling mdsvex.compile with no options

## 0.8.8

### Patch Changes

- 5949714: Update licences
- 142933b: Update Licenses
- 08f9963: Update licences
- a79e29f: Add full licenses.
- ca179e6: Update licenses.
