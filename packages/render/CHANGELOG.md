## 1.0.0-next.0

## 1.0.0-next.2

### Minor Changes

- [#1042](https://github.com/pngwn/MDsveX/pull/1042) [`364b172`](https://github.com/pngwn/MDsveX/commit/364b17205ef9a73e0fb037b7da0b217018cc097d) Thanks [@pngwn](https://github.com/pngwn)! - The renderer takes `fences`, a map from a code fence to the code, info string and `pre` props it renders with in place of what the document has. mdsvex uses it to show a file in a fence.

- [#1136](https://github.com/pngwn/MDsveX/pull/1136) [`26244e2`](https://github.com/pngwn/MDsveX/commit/26244e20b1ec22fa31ba8e126c7157465459ab47) Thanks [@pngwn](https://github.com/pngwn)! - Two replacement names for footnotes. A `footnote` export in a components module replaces a reference, and a `footnotes` export replaces the section at the end.

  ```js
  // src/lib/markdown.js
  export { default as footnote } from './markdown/Footnote.svelte';
  export { default as footnotes } from './markdown/Footnotes.svelte';
  ```

  `footnote` gets `label`, `number`, `href` and `id`, the link it would render as its `children`, and what its definition holds as the `note` snippet, which is enough to draw a side note or a hover card. `footnotes` gets the `<ol>` of notes as its `children`. The links and list items mdsvex writes for footnotes are not markdown nodes, so `a`, `sup`, `ol` and `li` replacements never get them.

- [#1135](https://github.com/pngwn/MDsveX/pull/1135) [`56c5c71`](https://github.com/pngwn/MDsveX/commit/56c5c71c9184b7a9362ac39bd3bbaee5412813b4) Thanks [@pngwn](https://github.com/pngwn)! - The renderer writes footnotes. A `footnote_reference` renders as its number in a `<sup>`, linked to its definition, and the definitions a reference reaches are written in number order in one `<section class="footnotes" role="doc-endnotes">` after the content of the document. A definition renders nothing where it was written.

  `CursorHTMLRenderer` takes the numbering as `footnotes`, the result of `footnote_index`, with an optional `label` and `back_label` for the accessible names. Without it the renderer numbers every label at its first reference and links it whether or not it has a definition, which suits a document that is still arriving. In the cached render the section is one more block after the last, with the `idx` `FOOTNOTES_BLOCK`.

  `Node.svelte` shows a reference as its label in a `<sup>` and a definition where it was written, behind the same label.

- [#1128](https://github.com/pngwn/MDsveX/pull/1128) [`9d4c1a4`](https://github.com/pngwn/MDsveX/commit/9d4c1a419c807a856aa4bed122bbb19b746b1738) Thanks [@pngwn](https://github.com/pngwn)! - A `CodeHighlighter` that sets `math: true` can also render inline math, a code span wrapped in dollars. The new `inline_math(code, start)` gives the body of the span, which is written with no `<code>` around it, and a `math` replacement takes it as children with the LaTeX as `code`. A highlighter without `math`, and a render with no highlighter, writes inline math as a plain code span with the LaTeX in it.

- [#945](https://github.com/pngwn/MDsveX/pull/945) [`50e0b8c`](https://github.com/pngwn/MDsveX/commit/50e0b8ccc97885e0ca7eed53c075bfaed7969b23) Thanks [@pngwn](https://github.com/pngwn)! - A `CodeHighlighter` can set `math: true` to say that it renders `math` fences as display math. Such a fence takes a `math` replacement instead of `pre`. The replacement gets the block's `props`, `code`, the fence meta as `meta`, and the block's body as children.

- [#1083](https://github.com/pngwn/MDsveX/pull/1083) [`9b8d968`](https://github.com/pngwn/MDsveX/commit/9b8d9681b17874aba4188e597c8b0d5075d155ed) Thanks [@pngwn](https://github.com/pngwn)! - A plugin can add a text node with its own text. `prepend` and `append` take the text of a text node in place of attrs:

  ```js
  link: {
  	parse(node) {
  		return () => {
  			const label = node.append('html', { tag: 'span', attributes: { class: 'visually-hidden' } });
  			label.append('text', ' (opens in a new tab)');
  		};
  	},
  }
  ```

  The text renders as text, so markup, a brace and a character reference in it come out as characters. It is a node of its own beside the text the parser sends, `text_content` reads it, and it goes when the node whose handler added it is revoked. `append('text')` without text now throws a `TypeError`, where it used to add an empty node.

- [#1081](https://github.com/pngwn/MDsveX/pull/1081) [`a3b2de5`](https://github.com/pngwn/MDsveX/commit/a3b2de5e01e4e8cb2f56bf06ad6a163c035e980b) Thanks [@pngwn](https://github.com/pngwn)! - A new `smart_punctuation` option turns straight quotes into curly quotes, two hyphens into an en dash, three into an em dash and three dots into an ellipsis. It is off by default, and `compile()` and the Vite plugin both take it.

  ```js
  mdsvex({ smart_punctuation: true });
  // or pick the kinds, and give the four quote strings of another language
  mdsvex({
  	smart_punctuation: {
  		dashes: false,
  		quotes: ['\u00ab', '\u00bb', '\u2039', '\u203a'],
  	},
  });
  ```

  Only prose changes. Code, math, urls, attributes, Svelte expressions, image alt text, titles and a character behind a backslash stay as written, and so does `--name` after a space, which is a command line flag. Heading ids are still made from the text as written.

- [#1191](https://github.com/pngwn/MDsveX/pull/1191) [`e27008d`](https://github.com/pngwn/MDsveX/commit/e27008dba1e54999c763edaf1af84ae585fba62d) Thanks [@pngwn](https://github.com/pngwn)! - A streaming view follows what plugins write and what their deferred tasks change. `PluginStream` from `@mdsvex/render/stream` holds the wire builder and the dispatcher of a document that arrives in pieces:

  ```js
  import { PluginStream } from '@mdsvex/render/stream';

  const stream = new PluginStream({ plugins, headings: make_heading_ids() });
  stream.renderers.push(renderer);
  stream.on_change(() => renderer.update(stream.buffer, ''));
  for await (const batch of batches) stream.apply(batch);
  await stream.end();
  ```

  - `stream.data.current` is what plugins wrote, a new object after each change, and a component that reads it renders again when it changes.
  - A node a deferred task changed renders again, even in a block the renderer had cached. `CursorHTMLRenderer` and `ComponentRenderer` take `invalidate(buf, nodes)` for this.
  - `end()` runs the sequential passes, waits for the deferred tasks and runs the document hooks, then renders every block again.

  Components read the data from the Svelte context under `Symbol.for('mdsvex.plugin_data')`, as `{ current }`. `Node.svelte` sets it from its `plugin_data` prop and a compiled document that has plugin data sets it too, so a component reads it the same way in both:

  ```svelte
  <script>
  	import { getContext } from 'svelte';
  	const data = getContext(Symbol.for('mdsvex.plugin_data'));
  </script>

  {data?.current?.toc?.headings.length}
  ```

  `Node.svelte` also takes `directives`, a component for a directive by its name, which gets the args as props and the label and the content as snippets, as in a compile. A stream with no plugin renders as before.

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

- [#924](https://github.com/pngwn/MDsveX/pull/924) [`cfc1ab0`](https://github.com/pngwn/MDsveX/commit/cfc1ab0468d82dc54d57ff525f542402a92423ee) Thanks [@github-actions](https://github.com/apps/github-actions)! - A template wrapper takes `data`, the name of a module script export to pass to the template as a prop of that name. A render without a sourcemap now writes its module code for a document that has neither frontmatter nor a module script, as a mapped render does.

### Patch Changes

- [#1224](https://github.com/pngwn/MDsveX/pull/1224) [`548f7c4`](https://github.com/pngwn/MDsveX/commit/548f7c4b57624646be0456dc6347a37fbcdcf114) Thanks [@pngwn](https://github.com/pngwn)! - The type declarations write `.js` on their relative imports, so they resolve under `moduleResolution: node16` and `nodenext` as well as `bundler`. A project on `node16` or `nodenext` used to get TS2834 errors from inside the packages, or with `skipLibCheck` on, `any` where the types should be.

- [#924](https://github.com/pngwn/MDsveX/pull/924) [`c085c85`](https://github.com/pngwn/MDsveX/commit/c085c856084f6346748a325b31fa50915413872a) Thanks [@github-actions](https://github.com/apps/github-actions)! - A brace escaped with a backslash renders as text, so Svelte no longer reads it as an expression. This holds in the alt text of an image too.

  ```md
  a \{1 + 1\} b
  ```

  renders `a {1 + 1} b`, where it used to render `a 2 b` or fail the build when the text between the braces was not JavaScript. An unescaped brace is an expression, as before.

- [#1201](https://github.com/pngwn/MDsveX/pull/1201) [`10b2e4d`](https://github.com/pngwn/MDsveX/commit/10b2e4dd55f90c125fcc54765eac1a22cb9816d8) Thanks [@pngwn](https://github.com/pngwn)! - The indent of a fenced code block is no longer part of its code. Each line loses up to as many columns of leading whitespace as the opening fence is indented past where its container's content starts, as in CommonMark, so a fence indented as a whole at the top of a document or inside an HTML element, a Svelte block or a directive holds the same code as it does unindented. The rendered code, the highlighter, live code and the source map all read the trimmed code, and the source map points each line of it at its own source line.

- [#1189](https://github.com/pngwn/MDsveX/pull/1189) [`4d8363d`](https://github.com/pngwn/MDsveX/commit/4d8363da5e7c19fc0486e8bbfd48da0b3477c6c0) Thanks [@pngwn](https://github.com/pngwn)! - `heading_ids` makes each id as its heading closes, in place of a pass after the parse. The ids are the ones it made before, and a parse plugin reads them in the function its heading handler returns, so it no longer has to be `sequential` for that:

  ```js
  const anchors = {
  	heading: {
  		parse(node) {
  			return () => node.prepend('link', { href: `#${node.attrs.id}` });
  		},
  	},
  };
  ```

  A plugin that changes the text of a heading in that function changes its id when it comes before the first plugin that reads `node.attrs`.

  An id is made from the ids before it and never changes once given. An id the document fixes, typed on a heading written as HTML or set on a heading by a plugin, is kept, and one that an element before it already has is now a `HeadingIdError` (code `id_taken`) naming both, where a made id used to move aside. A footnote is numbered at the end, so one whose id a heading took moves aside instead: `## Fn 1` keeps `fn-1` and the footnote `[^1]` gets `fn-1-1`.

  A document that streams gets the same ids as its headings arrive. `make_heading_ids()` from `mdsvex/compile`, given a slug or not, goes to the builder:

  ```js
  const builder = new WireTreeBuilder();
  builder.set_headings(make_heading_ids());
  ```

  `@mdsvex/parse` exports `HeadingIds`, `HeadingIdError` and `heading_slug`, and both builders take `set_headings`.

- [#943](https://github.com/pngwn/MDsveX/pull/943) [`636d9b9`](https://github.com/pngwn/MDsveX/commit/636d9b9c065a29007e9581151be1f6c061f256e4) Thanks [@pngwn](https://github.com/pngwn)! - `@mdsvex/render/html-cursor` exports `is_entity_name`, which tells whether a name is an HTML character reference the renderer leaves as written.

- [#940](https://github.com/pngwn/MDsveX/pull/940) [`bcb377f`](https://github.com/pngwn/MDsveX/commit/bcb377f43e310fee0f1280c0e509a81fc109c532) Thanks [@pngwn](https://github.com/pngwn)! - In a streaming render, an html element that is still open keeps its attribute text as written. `title="a &amp; b"` showed as `a &amp;amp; b` until the closing tag arrived.

- [#1140](https://github.com/pngwn/MDsveX/pull/1140) [`1cb7ec9`](https://github.com/pngwn/MDsveX/commit/1cb7ec95e846f268693dee42dc8ab4ea013de368) Thanks [@pngwn](https://github.com/pngwn)! - The packages hold only what they run. Tests, fixtures, build config and intermediate build output are no longer published, which takes `@mdsvex/parse` from 2,337 files to 28.

- [#1223](https://github.com/pngwn/MDsveX/pull/1223) [`a521675`](https://github.com/pngwn/MDsveX/commit/a52167532d3899c1900ffe81b43d9e12cbb89c87) Thanks [@pngwn](https://github.com/pngwn)! - A code span or an html comment a parse plugin makes shows the text the plugin puts in it, as a code fence does. Before, it rendered empty:

  ```js
  paragraph.append('code_span').append('text', 'a < b');
  // <code>a &lt; b</code>
  ```

- [#1219](https://github.com/pngwn/MDsveX/pull/1219) [`36b25c3`](https://github.com/pngwn/MDsveX/commit/36b25c33a81b385a868d10d56a16edc426247f42) Thanks [@pngwn](https://github.com/pngwn)! - A code fence a parse plugin makes shows the code the plugin puts in it. Text appended inside the fence is its code, in the html, through the highlighter, in a `pre` replacement and in a block that runs, as if the fence had been typed:

  ```js
  const fence = node.append('code_fence', { info: 'ts' });
  fence.append('text', 'let a = 1;');
  // <pre><code class="language-ts">let a = 1;</code></pre>
  ```

- [#1205](https://github.com/pngwn/MDsveX/pull/1205) [`bb3b2f1`](https://github.com/pngwn/MDsveX/commit/bb3b2f1e572fa7033a226f58585011bb7290afb5) Thanks [@pngwn](https://github.com/pngwn)! - A node a parse plugin adds with `append`, `prepend` or `wrap_inner` has no place in the source, and the source map now leaves it out. A mapped render gave it a `node` record at offset 0 with a length of `0xffffffff` and an `open_syntax` record at offset 0, and the source map of a Vite build pointed it at the start of the document. The nodes `run.replace` makes keep the span of the text they replaced.

- [#940](https://github.com/pngwn/MDsveX/pull/940) [`bcb377f`](https://github.com/pngwn/MDsveX/commit/bcb377f43e310fee0f1280c0e509a81fc109c532) Thanks [@pngwn](https://github.com/pngwn)! - A self-closing element made by a parse plugin, such as an `img`, renders as its tag and attributes. It rendered the source of the document in its place.

- [#924](https://github.com/pngwn/MDsveX/pull/924) [`1e8cb18`](https://github.com/pngwn/MDsveX/commit/1e8cb18b19182c8d8296789ff6e462dd4bcc70c6) Thanks [@github-actions](https://github.com/apps/github-actions)! - The code of a fence, the text of a comment and the content of `<script>` and `<style>` no longer hold the `>` markers or the list indent of the lines they run over. A fence in a list item renders without the indent of the item in its code.

  ````md
  - ```js
    const a = 1;
    ```
  ````

  The code is `const a = 1;`, where it used to keep the two spaces before it. The parser stores this text on the node, and the node's value range still covers the source as written.

- [#1120](https://github.com/pngwn/MDsveX/pull/1120) [`9df619b`](https://github.com/pngwn/MDsveX/commit/9df619b02dc35693f47d4e0751df4c72f20ae491) Thanks [@pngwn](https://github.com/pngwn)! - The content of a typed `<pre>` or `<textarea>` is text, kept as written up to the close tag, as the content of `<script>` and `<style>` is. Line breaks and indentation stay, no paragraph or heading is made inside, and markdown markers are plain characters.

  ```md
  <pre>
  line one
    indented *x*
  
  # line three
  </pre>
  ```

  The text goes to Svelte as it is written, so an expression such as `{value}` and an element such as `<b>` still work there. With `component_mode: 'all'` a `pre` component gets that text as its children.

  A `<pre>` that starts a line is a block, as a `<div>` is: it ends the paragraph or the table on the line before it.

- [#1140](https://github.com/pngwn/MDsveX/pull/1140) [`1cb7ec9`](https://github.com/pngwn/MDsveX/commit/1cb7ec95e846f268693dee42dc8ab4ea013de368) Thanks [@pngwn](https://github.com/pngwn)! - The package ships built type declarations. Its types were its TypeScript source, which a project that imports `mdsvex` checks under its own compiler flags, so a project with `noUncheckedIndexedAccess` got errors from inside `@mdsvex/render` that it could not fix.

- [#1122](https://github.com/pngwn/MDsveX/pull/1122) [`e09ab81`](https://github.com/pngwn/MDsveX/commit/e09ab81451d98d6dd8d9b77f2f4409d169ae9a49) Thanks [@pngwn](https://github.com/pngwn)! - An element that writes one attribute twice is compiled with both, so Svelte reports the duplicate as it does in a `.svelte` file. An element with content used to be written with only one of them, which hid the mistake.

  ```md
  <div class="a" class="b">x</div>
  ```

  This now fails in Svelte with `attribute_duplicate`. A self closing tag such as `<img alt="a" alt="b" />` already did.

- [#923](https://github.com/pngwn/MDsveX/pull/923) [`6985317`](https://github.com/pngwn/MDsveX/commit/6985317ea53b10f5cf99d6a5d6142dd6bcb31e41) Thanks [@pngwn](https://github.com/pngwn)! - The script that bare imports start is `lang="ts"` when an import is a type import or the module script is `lang="ts"`.

- Updated dependencies [[`6e921ad`](https://github.com/pngwn/MDsveX/commit/6e921adadb13a01894c48a1a8ba8e4cbac1a5016), [`7786d93`](https://github.com/pngwn/MDsveX/commit/7786d9301c06d94895386b5f03b7dc96fb5f2b8e), [`6c5901c`](https://github.com/pngwn/MDsveX/commit/6c5901c1eb87d10a2f43c835a10930a9dd5c0d27), [`dadfba9`](https://github.com/pngwn/MDsveX/commit/dadfba96363ab3fc59e65799243651ea7b78195c), [`edc14f4`](https://github.com/pngwn/MDsveX/commit/edc14f464d333dda092da1883d73b3c8fcd204b9), [`edc14f4`](https://github.com/pngwn/MDsveX/commit/edc14f464d333dda092da1883d73b3c8fcd204b9), [`edc14f4`](https://github.com/pngwn/MDsveX/commit/edc14f464d333dda092da1883d73b3c8fcd204b9), [`1c5c5ef`](https://github.com/pngwn/MDsveX/commit/1c5c5ef99483ac86ac52f434fe34b9237c27f12c), [`e42f3f1`](https://github.com/pngwn/MDsveX/commit/e42f3f1d978ab3746f9863da229078f77db85376), [`2781cbe`](https://github.com/pngwn/MDsveX/commit/2781cbe6b697dd5f2a268de17bc6049b41eca5b6), [`6b67a44`](https://github.com/pngwn/MDsveX/commit/6b67a4478687548dc1176fe659f8c917828c67c5), [`be86761`](https://github.com/pngwn/MDsveX/commit/be867619ed92fb0d7e9ef4294aa88afedc198683), [`354ab3c`](https://github.com/pngwn/MDsveX/commit/354ab3c6d672de2c8d5aa40e1e9d3da5ed4ae592), [`7900bf2`](https://github.com/pngwn/MDsveX/commit/7900bf24137c24de5ff749e65bf98e5f5fa18ec9), [`0462e67`](https://github.com/pngwn/MDsveX/commit/0462e678afdb484b031e7ddb4c7086fdee273f27), [`34aae13`](https://github.com/pngwn/MDsveX/commit/34aae13494d0f7678647cba02f223f68d56e08a2), [`d4bbd4d`](https://github.com/pngwn/MDsveX/commit/d4bbd4dfb193cb5f6bbf10ed9444bf343c58590d), [`34aae13`](https://github.com/pngwn/MDsveX/commit/34aae13494d0f7678647cba02f223f68d56e08a2), [`b214e6e`](https://github.com/pngwn/MDsveX/commit/b214e6e2f9596b9619b4e9d2bc43f9277c5d5395), [`7524ce7`](https://github.com/pngwn/MDsveX/commit/7524ce7de4cbdfd545c455fb8d1643031306b303), [`8e11a68`](https://github.com/pngwn/MDsveX/commit/8e11a689e5e00d92dd66ac92ea2f5f34be5963a1), [`ddf0d00`](https://github.com/pngwn/MDsveX/commit/ddf0d00c8313d9d314c71ad8592d6df7bc8f44ff), [`ef131ac`](https://github.com/pngwn/MDsveX/commit/ef131aca6ad93a6803d18b43ce919089fd0039c6), [`3bdc62e`](https://github.com/pngwn/MDsveX/commit/3bdc62eb6bd0ed4110d3af9b3485934ea996c19f), [`c1ccbfd`](https://github.com/pngwn/MDsveX/commit/c1ccbfdc7fc7cc7e63587bedd7d4287932462d50), [`548f7c4`](https://github.com/pngwn/MDsveX/commit/548f7c4b57624646be0456dc6347a37fbcdcf114), [`2f7688b`](https://github.com/pngwn/MDsveX/commit/2f7688b8185dc961a4b4c1e3382f0c2b58457474), [`b73e460`](https://github.com/pngwn/MDsveX/commit/b73e4606a005f2093a90ac025cfe089e44c9a373), [`afaaacc`](https://github.com/pngwn/MDsveX/commit/afaaacc69abaf55588ed199b9a50406e94b56914), [`e16f89c`](https://github.com/pngwn/MDsveX/commit/e16f89c492542663079c4741d54727084f46b188), [`aa0a892`](https://github.com/pngwn/MDsveX/commit/aa0a89224d5781fba95fef0102d7b288af18a0d0), [`69fe42e`](https://github.com/pngwn/MDsveX/commit/69fe42eb47883e7029530bf576c2fe09acb00628), [`bcb377f`](https://github.com/pngwn/MDsveX/commit/bcb377f43e310fee0f1280c0e509a81fc109c532), [`1b328e7`](https://github.com/pngwn/MDsveX/commit/1b328e7130927ac495f3d969d3d4f7f7b876c28d), [`b1ccd82`](https://github.com/pngwn/MDsveX/commit/b1ccd825b1cb05c59491880a112490a87b5c0d1d), [`7900bf2`](https://github.com/pngwn/MDsveX/commit/7900bf24137c24de5ff749e65bf98e5f5fa18ec9), [`7900bf2`](https://github.com/pngwn/MDsveX/commit/7900bf24137c24de5ff749e65bf98e5f5fa18ec9), [`3343943`](https://github.com/pngwn/MDsveX/commit/3343943f3907da8ce45488c2da3d78023bd68851), [`0785cb7`](https://github.com/pngwn/MDsveX/commit/0785cb7950a81839e7dde22104f3f0bd704e0a29), [`c9a977a`](https://github.com/pngwn/MDsveX/commit/c9a977ad3dadd981ca7f8c66104fd38435306408), [`9dd0099`](https://github.com/pngwn/MDsveX/commit/9dd00997dfafb1be89f0ee220269722eed83a535), [`1e8cb18`](https://github.com/pngwn/MDsveX/commit/1e8cb18b19182c8d8296789ff6e462dd4bcc70c6), [`10b2e4d`](https://github.com/pngwn/MDsveX/commit/10b2e4dd55f90c125fcc54765eac1a22cb9816d8), [`14e9951`](https://github.com/pngwn/MDsveX/commit/14e9951b3b9de574ca0cc9c9062b48328586f1b4), [`26244e2`](https://github.com/pngwn/MDsveX/commit/26244e20b1ec22fa31ba8e126c7157465459ab47), [`6a4c139`](https://github.com/pngwn/MDsveX/commit/6a4c1394d30e1b5c87ca63e96b3be6d5dfa10667), [`0c8b126`](https://github.com/pngwn/MDsveX/commit/0c8b1262437a4d22258949ad082b927c90078d98), [`56c5c71`](https://github.com/pngwn/MDsveX/commit/56c5c71c9184b7a9362ac39bd3bbaee5412813b4), [`3f7ad22`](https://github.com/pngwn/MDsveX/commit/3f7ad22711f914a27338428e8a9fbbc24c03b33e), [`bcb377f`](https://github.com/pngwn/MDsveX/commit/bcb377f43e310fee0f1280c0e509a81fc109c532), [`b14fe53`](https://github.com/pngwn/MDsveX/commit/b14fe5315d014096fb4e7d1d0c45152ee3eb3e0e), [`4d8363d`](https://github.com/pngwn/MDsveX/commit/4d8363da5e7c19fc0486e8bbfd48da0b3477c6c0), [`58ca71c`](https://github.com/pngwn/MDsveX/commit/58ca71c76191f67c8215441f582f893e2cb7cdf6), [`4d8363d`](https://github.com/pngwn/MDsveX/commit/4d8363da5e7c19fc0486e8bbfd48da0b3477c6c0), [`37b0c66`](https://github.com/pngwn/MDsveX/commit/37b0c66b69197772f14722391d2affdd20295ff8), [`4b93f69`](https://github.com/pngwn/MDsveX/commit/4b93f697ee685b4192b10dd689dd044708e74637), [`1e8cb18`](https://github.com/pngwn/MDsveX/commit/1e8cb18b19182c8d8296789ff6e462dd4bcc70c6), [`9d4c1a4`](https://github.com/pngwn/MDsveX/commit/9d4c1a419c807a856aa4bed122bbb19b746b1738), [`4efb7c1`](https://github.com/pngwn/MDsveX/commit/4efb7c130ebc6095fd9ead7a41cf043ffc1ef9c2), [`b966a44`](https://github.com/pngwn/MDsveX/commit/b966a447d4d32ee1868dc3a13653129b68f25235), [`911857b`](https://github.com/pngwn/MDsveX/commit/911857b811121fc1ca09f5e8effb21b7f937174a), [`9277618`](https://github.com/pngwn/MDsveX/commit/9277618c8e1e4a7278245a84c7210514cc55e834), [`afaaacc`](https://github.com/pngwn/MDsveX/commit/afaaacc69abaf55588ed199b9a50406e94b56914), [`afaaacc`](https://github.com/pngwn/MDsveX/commit/afaaacc69abaf55588ed199b9a50406e94b56914), [`afaaacc`](https://github.com/pngwn/MDsveX/commit/afaaacc69abaf55588ed199b9a50406e94b56914), [`6272e0d`](https://github.com/pngwn/MDsveX/commit/6272e0db220788f80f05463531a0ea0e1358ff0e), [`6985317`](https://github.com/pngwn/MDsveX/commit/6985317ea53b10f5cf99d6a5d6142dd6bcb31e41), [`b361600`](https://github.com/pngwn/MDsveX/commit/b361600c167cf1d53094cb2e1309768b4c8316e0), [`6baeb40`](https://github.com/pngwn/MDsveX/commit/6baeb409b9698d54cfa34e87cf92944806c96002), [`9a8b94d`](https://github.com/pngwn/MDsveX/commit/9a8b94da69804114e2cac93fc82cd12094592662), [`a3dc415`](https://github.com/pngwn/MDsveX/commit/a3dc415629e6ca782fa1e36687c384f56a569096), [`c37520f`](https://github.com/pngwn/MDsveX/commit/c37520f5d0ba21dc7647e4a31cedc723636a36dd), [`f1fd1f3`](https://github.com/pngwn/MDsveX/commit/f1fd1f3f3d299d36c8400edd947912cad6216eea), [`2749b28`](https://github.com/pngwn/MDsveX/commit/2749b28e8d5f1e75e663a8485b521472020be143), [`503a007`](https://github.com/pngwn/MDsveX/commit/503a007371d8cd60a4f7b2fec74c89c476196c39), [`78c552f`](https://github.com/pngwn/MDsveX/commit/78c552f8951c9186ec5b33934477d31e6028b627), [`1cb7ec9`](https://github.com/pngwn/MDsveX/commit/1cb7ec95e846f268693dee42dc8ab4ea013de368), [`4d4b8d8`](https://github.com/pngwn/MDsveX/commit/4d4b8d8a5418a9356cc1a332c94f91ba4b9a7148), [`fd12ae7`](https://github.com/pngwn/MDsveX/commit/fd12ae7c3e1e32956857388512444940049e955e), [`f1fd1f3`](https://github.com/pngwn/MDsveX/commit/f1fd1f3f3d299d36c8400edd947912cad6216eea), [`89bf377`](https://github.com/pngwn/MDsveX/commit/89bf3776a22003ab42517b9b8a542507fce6f03b), [`524cf8a`](https://github.com/pngwn/MDsveX/commit/524cf8a1fe311c071aa2937950190891c43df0a0), [`364b172`](https://github.com/pngwn/MDsveX/commit/364b17205ef9a73e0fb037b7da0b217018cc097d), [`34aae13`](https://github.com/pngwn/MDsveX/commit/34aae13494d0f7678647cba02f223f68d56e08a2), [`a521675`](https://github.com/pngwn/MDsveX/commit/a52167532d3899c1900ffe81b43d9e12cbb89c87), [`a3dc415`](https://github.com/pngwn/MDsveX/commit/a3dc415629e6ca782fa1e36687c384f56a569096), [`3022559`](https://github.com/pngwn/MDsveX/commit/30225590d894496515c1dd1c5f602e790ca92e7b), [`c340fa5`](https://github.com/pngwn/MDsveX/commit/c340fa5cbe8bcd208f3b1c2784d10dedd0278736), [`d8f5f34`](https://github.com/pngwn/MDsveX/commit/d8f5f34b8e1fc503268850c2eaeec62866f95bf0), [`290a67a`](https://github.com/pngwn/MDsveX/commit/290a67a77e13548ac001f4a34620f7721f818d10), [`290a67a`](https://github.com/pngwn/MDsveX/commit/290a67a77e13548ac001f4a34620f7721f818d10), [`36b25c3`](https://github.com/pngwn/MDsveX/commit/36b25c33a81b385a868d10d56a16edc426247f42), [`34aae13`](https://github.com/pngwn/MDsveX/commit/34aae13494d0f7678647cba02f223f68d56e08a2), [`a3dc415`](https://github.com/pngwn/MDsveX/commit/a3dc415629e6ca782fa1e36687c384f56a569096), [`1af6870`](https://github.com/pngwn/MDsveX/commit/1af687013416fa29fc7363216eee4daaebdb7b03), [`9b8d968`](https://github.com/pngwn/MDsveX/commit/9b8d9681b17874aba4188e597c8b0d5075d155ed), [`1e8cb18`](https://github.com/pngwn/MDsveX/commit/1e8cb18b19182c8d8296789ff6e462dd4bcc70c6), [`2ecbf3d`](https://github.com/pngwn/MDsveX/commit/2ecbf3db4d5eb9a1d3fd01c041a3261eaa76a10c), [`604ea57`](https://github.com/pngwn/MDsveX/commit/604ea571b652d236951b98be5be49296dbfcc0f4), [`d313802`](https://github.com/pngwn/MDsveX/commit/d31380241a1c9e096da42261a6025b6ff8b57521), [`8882b5a`](https://github.com/pngwn/MDsveX/commit/8882b5af6820661b4eecff452b88fb4b8d7815b8), [`2f7688b`](https://github.com/pngwn/MDsveX/commit/2f7688b8185dc961a4b4c1e3382f0c2b58457474), [`9df619b`](https://github.com/pngwn/MDsveX/commit/9df619b02dc35693f47d4e0751df4c72f20ae491), [`bcb377f`](https://github.com/pngwn/MDsveX/commit/bcb377f43e310fee0f1280c0e509a81fc109c532), [`6baeb40`](https://github.com/pngwn/MDsveX/commit/6baeb409b9698d54cfa34e87cf92944806c96002), [`4f1821d`](https://github.com/pngwn/MDsveX/commit/4f1821d6b94839b70904d63df154534cd0d44c4b), [`0462e67`](https://github.com/pngwn/MDsveX/commit/0462e678afdb484b031e7ddb4c7086fdee273f27), [`6baeb40`](https://github.com/pngwn/MDsveX/commit/6baeb409b9698d54cfa34e87cf92944806c96002), [`0462e67`](https://github.com/pngwn/MDsveX/commit/0462e678afdb484b031e7ddb4c7086fdee273f27), [`a87bf30`](https://github.com/pngwn/MDsveX/commit/a87bf30a4ce04fba3ff18366b9b808b6338fd598), [`1c99e72`](https://github.com/pngwn/MDsveX/commit/1c99e72673fe19216a0a809acce122b176364135), [`9dc77cf`](https://github.com/pngwn/MDsveX/commit/9dc77cf82fc9180fc2d2ca57fa4866b83141750d), [`2f7688b`](https://github.com/pngwn/MDsveX/commit/2f7688b8185dc961a4b4c1e3382f0c2b58457474), [`cc819e4`](https://github.com/pngwn/MDsveX/commit/cc819e40ae16f4c13ab164328ea3eee94f47446a), [`680e26f`](https://github.com/pngwn/MDsveX/commit/680e26f83eba5b0d2a74c44d24ca022ea3d699b3), [`707e616`](https://github.com/pngwn/MDsveX/commit/707e616f8672e51966ffcbd08bc8beb994910262), [`f3ee7ec`](https://github.com/pngwn/MDsveX/commit/f3ee7ecb9ac2f3b9711631776b3cabd0bc757924), [`bcb377f`](https://github.com/pngwn/MDsveX/commit/bcb377f43e310fee0f1280c0e509a81fc109c532), [`2f6af77`](https://github.com/pngwn/MDsveX/commit/2f6af775869784ac0d9f1cf0f9d7fe6f60a69f64), [`2f6af77`](https://github.com/pngwn/MDsveX/commit/2f6af775869784ac0d9f1cf0f9d7fe6f60a69f64), [`4d4b8d8`](https://github.com/pngwn/MDsveX/commit/4d4b8d8a5418a9356cc1a332c94f91ba4b9a7148), [`f62d613`](https://github.com/pngwn/MDsveX/commit/f62d6131d1b14a7876bc80a7a67cb08bb51acafa), [`222debe`](https://github.com/pngwn/MDsveX/commit/222debe143c7ae2b63c23e3202fccfbdf1128f56), [`2f6af77`](https://github.com/pngwn/MDsveX/commit/2f6af775869784ac0d9f1cf0f9d7fe6f60a69f64), [`2f8da0a`](https://github.com/pngwn/MDsveX/commit/2f8da0a6ef28a23e80c48627d7a25a30b6ea2ac8), [`222debe`](https://github.com/pngwn/MDsveX/commit/222debe143c7ae2b63c23e3202fccfbdf1128f56), [`222debe`](https://github.com/pngwn/MDsveX/commit/222debe143c7ae2b63c23e3202fccfbdf1128f56), [`06b466b`](https://github.com/pngwn/MDsveX/commit/06b466b326293b1cb1f12a69c93513f138f03774), [`2f7688b`](https://github.com/pngwn/MDsveX/commit/2f7688b8185dc961a4b4c1e3382f0c2b58457474), [`182abbc`](https://github.com/pngwn/MDsveX/commit/182abbc20d5a942ada81867ec6c482f0d89117c6), [`88b34e5`](https://github.com/pngwn/MDsveX/commit/88b34e5cd7c7549cd0bf0375131e4090ce060cf0), [`6d96607`](https://github.com/pngwn/MDsveX/commit/6d9660796b1cff6e781bfb6b7b2d9af87edeadae), [`00fe005`](https://github.com/pngwn/MDsveX/commit/00fe005adf2963908dcbf15b6c2986416345710f), [`b26b0c4`](https://github.com/pngwn/MDsveX/commit/b26b0c4d5afd1db34e840878e7b352ddd3d9294f), [`aa06e2f`](https://github.com/pngwn/MDsveX/commit/aa06e2fdd972cfef890313d15a8a22b95d31bd2e), [`9b9fc0c`](https://github.com/pngwn/MDsveX/commit/9b9fc0c643423a48276582ef8e9b61c4d0f8c4e7), [`68e2a59`](https://github.com/pngwn/MDsveX/commit/68e2a59528b92a1c43ed961a69f10e0eaed1bee3), [`6c73849`](https://github.com/pngwn/MDsveX/commit/6c73849b9d27d895795f32fcb6b8ae03a7a418af), [`6baeb40`](https://github.com/pngwn/MDsveX/commit/6baeb409b9698d54cfa34e87cf92944806c96002), [`28aa85e`](https://github.com/pngwn/MDsveX/commit/28aa85ecdbdfe6058954201d806564652be578f2), [`28aa85e`](https://github.com/pngwn/MDsveX/commit/28aa85ecdbdfe6058954201d806564652be578f2), [`28aa85e`](https://github.com/pngwn/MDsveX/commit/28aa85ecdbdfe6058954201d806564652be578f2), [`a91c589`](https://github.com/pngwn/MDsveX/commit/a91c589eceab67c32767fbce7eb9061c2a1cdb22), [`817c168`](https://github.com/pngwn/MDsveX/commit/817c168a85bb7033a8c41a8037d5ed14919d35b3), [`06b1c7f`](https://github.com/pngwn/MDsveX/commit/06b1c7f75479cb2f39fb91560fdb0322433315d7), [`5ba36ec`](https://github.com/pngwn/MDsveX/commit/5ba36ecea4c8008f0249fc105d86486a52621ddc), [`7900bf2`](https://github.com/pngwn/MDsveX/commit/7900bf24137c24de5ff749e65bf98e5f5fa18ec9), [`3ca3b52`](https://github.com/pngwn/MDsveX/commit/3ca3b525050c5874ac9ff7130033fe00d0112cba), [`2c06694`](https://github.com/pngwn/MDsveX/commit/2c0669413118ca19a8b97ba4e68bdda27f9a2d2d), [`cc7aef8`](https://github.com/pngwn/MDsveX/commit/cc7aef8c239cfc876e80fc9340a1fb8e56818e4d), [`bcb377f`](https://github.com/pngwn/MDsveX/commit/bcb377f43e310fee0f1280c0e509a81fc109c532), [`4b93f69`](https://github.com/pngwn/MDsveX/commit/4b93f697ee685b4192b10dd689dd044708e74637), [`68e2a59`](https://github.com/pngwn/MDsveX/commit/68e2a59528b92a1c43ed961a69f10e0eaed1bee3), [`db21435`](https://github.com/pngwn/MDsveX/commit/db214350aab84b0d5b91560d8eb4c5b7ec11728f), [`bcb377f`](https://github.com/pngwn/MDsveX/commit/bcb377f43e310fee0f1280c0e509a81fc109c532), [`cc7aef8`](https://github.com/pngwn/MDsveX/commit/cc7aef8c239cfc876e80fc9340a1fb8e56818e4d)]:
  - @mdsvex/parse@1.0.0-next.2

## 1.0.0-next.1

### Minor Changes

- [#866](https://github.com/pngwn/MDsveX/pull/866) [`60da683`](https://github.com/pngwn/MDsveX/commit/60da68313df11747bdd6235dffc325c30af60cb2) Thanks [@pngwn](https://github.com/pngwn)! - Import statements at the top of a document are kept. They go into the document's instance `<script>`, or into a new `<script>` when there is none.

  ```md
  import Chart from './Chart.svelte'

  <Chart />
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

- [#866](https://github.com/pngwn/MDsveX/pull/866) [`60da683`](https://github.com/pngwn/MDsveX/commit/60da68313df11747bdd6235dffc325c30af60cb2) Thanks [@pngwn](https://github.com/pngwn)! - A top level `<script>` with a `src` attribute, as in pasted tweet or Instagram embeds, renders as `<svelte:element this={"script"}>`. Svelte treats every top level `<script>` as the component script, so two embeds used to fail to compile.

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

- [#862](https://github.com/pngwn/MDsveX/pull/862) [`31aa6e2`](https://github.com/pngwn/MDsveX/commit/31aa6e20390c6fa656845add1d19e0439dda48c7) Thanks [@pngwn](https://github.com/pngwn)! - Parsing, compiling, parse plugins and the vite plugin are faster for documents of every size. The largest gains are in compiles with parse plugins and in the vite plugin, where chaining the Svelte compiler's sourcemap no longer goes through a general purpose remapper.

- [#865](https://github.com/pngwn/MDsveX/pull/865) [`fd54579`](https://github.com/pngwn/MDsveX/commit/fd5457966ce23d1eb29a7935a550394adf4498e4) Thanks [@pngwn](https://github.com/pngwn)! - Parsing, incremental parsing, compiling with and without sourcemaps, parse plugins and the vite plugin are faster again for documents of every size, with the largest gains on small documents, sourcemapped compiles and Windows line endings.

- [#856](https://github.com/pngwn/MDsveX/pull/856) [`8bd14fe`](https://github.com/pngwn/MDsveX/commit/8bd14fe77aed1ff532757a06e934fa6238ecb2da) Thanks [@pngwn](https://github.com/pngwn)! - Rendering to HTML without a source map is a few percent faster.

- [#855](https://github.com/pngwn/MDsveX/pull/855) [`98a1b87`](https://github.com/pngwn/MDsveX/commit/98a1b87b1c45f192c93bf3b910d6ebc8284b94f4) Thanks [@pngwn](https://github.com/pngwn)! - Rendering markdown to HTML is much faster, up to about 2.9x, and building source maps for the rendered output is many times faster.

- [#848](https://github.com/pngwn/MDsveX/pull/848) [`f2ff5fe`](https://github.com/pngwn/MDsveX/commit/f2ff5fe144a9009a79e0aa7a6f08f1bed5a7696c) Thanks [@pngwn](https://github.com/pngwn)! - Sourcemaps for large documents build in linear time, so a 100KB file takes milliseconds instead of over a second in the vite plugin.

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

- [#884](https://github.com/pngwn/MDsveX/pull/884) [`e708e1d`](https://github.com/pngwn/MDsveX/commit/e708e1d4c66478efd8606fa2e1ff2fee40e0732a) Thanks [@pngwn](https://github.com/pngwn)! - A fenced code block inside a block quote renders without the quote markers at the start of each line.

- [#855](https://github.com/pngwn/MDsveX/pull/855) [`98a1b87`](https://github.com/pngwn/MDsveX/commit/98a1b87b1c45f192c93bf3b910d6ebc8284b94f4) Thanks [@pngwn](https://github.com/pngwn)! - The low-level render helpers exported with a leading underscore now collect source mappings into a `MapSink` instead of an array, and the `PendingMapping` type is no longer exported.

- [#871](https://github.com/pngwn/MDsveX/pull/871) [`2867d9b`](https://github.com/pngwn/MDsveX/commit/2867d9b0df02ae44f0475403ce62393bca4f64b9) Thanks [@pngwn](https://github.com/pngwn)! - mdsvex now ships type declarations, so TypeScript finds types for `compile`, `CompileOptions`, `mdsvex` and the other exports instead of reporting a missing declaration file. Types for `@mdsvex/render` also check under TypeScript 6.

- [#889](https://github.com/pngwn/MDsveX/pull/889) [`c56db79`](https://github.com/pngwn/MDsveX/commit/c56db798f4f43e437956bb3afb2919c09076cd6e) Thanks [@pngwn](https://github.com/pngwn)! - Character references like `&lt;`, `&copy;` and `&#123;` in text, link and image attributes render as written instead of being escaped a second time. A bare `&`, a backslash escaped `\&` and any `&` inside code are still escaped.

  ```md
  a &lt; b &copy;
  ```

- [#875](https://github.com/pngwn/MDsveX/pull/875) [`2927382`](https://github.com/pngwn/MDsveX/commit/29273823dc39bf4ab9b422210ee8acd867c29bc9) Thanks [@pngwn](https://github.com/pngwn)! - Attribute values in raw html render as written, so an entity like `&amp;` is no longer escaped a second time.

  ```md
  <div title="a &amp; b">x</div>
  ```

- [#873](https://github.com/pngwn/MDsveX/pull/873) [`69b6c62`](https://github.com/pngwn/MDsveX/commit/69b6c624256f1e8fb1cf8e5f348980a043f2c1db) Thanks [@pngwn](https://github.com/pngwn)! - Spread and attachment attributes on HTML you type, such as `<div {...rest} {@attach tooltip}>`, are no longer rendered as `...rest={...rest}`, which Svelte failed to compile.

- [#821](https://github.com/pngwn/MDsveX/pull/821) [`ed11417`](https://github.com/pngwn/MDsveX/commit/ed11417775290f85a0b14dda03d1c11d48bbd239) Thanks [@pngwn](https://github.com/pngwn)! - Files with Windows (`\r\n`) or old Mac (`\r`) line endings compile to the same HTML as their `\n` equivalents, and their sourcemaps point at the right lines and columns in the original file.

- Updated dependencies [[`cfee8d1`](https://github.com/pngwn/MDsveX/commit/cfee8d1a968ac78329e314650c51785968bf1dff), [`b249bf0`](https://github.com/pngwn/MDsveX/commit/b249bf0dbbfdef330e0e78739b7d44176f9c98b9), [`29b6dd1`](https://github.com/pngwn/MDsveX/commit/29b6dd127efc0d00dff650d320d4d003f6d2b1b6), [`7815ee9`](https://github.com/pngwn/MDsveX/commit/7815ee9d0993774f6f648d46d35ce3f900a6eed4), [`db0418d`](https://github.com/pngwn/MDsveX/commit/db0418d50bcd286a062cd0b6243a234167d11781), [`ebdb9fb`](https://github.com/pngwn/MDsveX/commit/ebdb9fb687933c69da0260eb50e8a4d2fae2bbca), [`79bebc9`](https://github.com/pngwn/MDsveX/commit/79bebc937b5c51d7fb50d06ff09f83bf23d44a87), [`1219ceb`](https://github.com/pngwn/MDsveX/commit/1219ceb0c6805ac8b169dadb13694f354d96a619), [`98a1b87`](https://github.com/pngwn/MDsveX/commit/98a1b87b1c45f192c93bf3b910d6ebc8284b94f4), [`31aa6e2`](https://github.com/pngwn/MDsveX/commit/31aa6e20390c6fa656845add1d19e0439dda48c7), [`fd54579`](https://github.com/pngwn/MDsveX/commit/fd5457966ce23d1eb29a7935a550394adf4498e4), [`e804671`](https://github.com/pngwn/MDsveX/commit/e804671afb412c81ce5cb38c40588257d34ab99d), [`e804671`](https://github.com/pngwn/MDsveX/commit/e804671afb412c81ce5cb38c40588257d34ab99d), [`2f981d8`](https://github.com/pngwn/MDsveX/commit/2f981d84b04a718dae82f79e6a9243868444f88c), [`cfee8d1`](https://github.com/pngwn/MDsveX/commit/cfee8d1a968ac78329e314650c51785968bf1dff), [`6f4a27d`](https://github.com/pngwn/MDsveX/commit/6f4a27da11241056ef4912618cefee521525a82a), [`585a698`](https://github.com/pngwn/MDsveX/commit/585a698f25fd0b6160e25bf0022e3cdabde65172), [`65c9784`](https://github.com/pngwn/MDsveX/commit/65c9784b51209c7706eebaada3e9908bda9d5fa4), [`31aa6e2`](https://github.com/pngwn/MDsveX/commit/31aa6e20390c6fa656845add1d19e0439dda48c7), [`585a698`](https://github.com/pngwn/MDsveX/commit/585a698f25fd0b6160e25bf0022e3cdabde65172), [`585a698`](https://github.com/pngwn/MDsveX/commit/585a698f25fd0b6160e25bf0022e3cdabde65172), [`98a1b87`](https://github.com/pngwn/MDsveX/commit/98a1b87b1c45f192c93bf3b910d6ebc8284b94f4), [`fd54579`](https://github.com/pngwn/MDsveX/commit/fd5457966ce23d1eb29a7935a550394adf4498e4), [`585a698`](https://github.com/pngwn/MDsveX/commit/585a698f25fd0b6160e25bf0022e3cdabde65172), [`585a698`](https://github.com/pngwn/MDsveX/commit/585a698f25fd0b6160e25bf0022e3cdabde65172), [`29b6dd1`](https://github.com/pngwn/MDsveX/commit/29b6dd127efc0d00dff650d320d4d003f6d2b1b6), [`31aa6e2`](https://github.com/pngwn/MDsveX/commit/31aa6e20390c6fa656845add1d19e0439dda48c7), [`9903c3a`](https://github.com/pngwn/MDsveX/commit/9903c3ad8d764085285486816736c4f3ea140a99), [`7e69d52`](https://github.com/pngwn/MDsveX/commit/7e69d52284e20892752041fb42726480d88cf31c), [`fd54579`](https://github.com/pngwn/MDsveX/commit/fd5457966ce23d1eb29a7935a550394adf4498e4), [`31aa6e2`](https://github.com/pngwn/MDsveX/commit/31aa6e20390c6fa656845add1d19e0439dda48c7), [`e804671`](https://github.com/pngwn/MDsveX/commit/e804671afb412c81ce5cb38c40588257d34ab99d), [`98a1b87`](https://github.com/pngwn/MDsveX/commit/98a1b87b1c45f192c93bf3b910d6ebc8284b94f4), [`f2e4911`](https://github.com/pngwn/MDsveX/commit/f2e4911db89f7c66f684c0da839deeb3bc46fa55), [`e804671`](https://github.com/pngwn/MDsveX/commit/e804671afb412c81ce5cb38c40588257d34ab99d), [`2f981d8`](https://github.com/pngwn/MDsveX/commit/2f981d84b04a718dae82f79e6a9243868444f88c), [`e804671`](https://github.com/pngwn/MDsveX/commit/e804671afb412c81ce5cb38c40588257d34ab99d), [`ed11417`](https://github.com/pngwn/MDsveX/commit/ed11417775290f85a0b14dda03d1c11d48bbd239), [`fd54579`](https://github.com/pngwn/MDsveX/commit/fd5457966ce23d1eb29a7935a550394adf4498e4), [`60da683`](https://github.com/pngwn/MDsveX/commit/60da68313df11747bdd6235dffc325c30af60cb2), [`430cf34`](https://github.com/pngwn/MDsveX/commit/430cf3493575c706b31b5e02b4c219f4b6ea0569), [`eefaff5`](https://github.com/pngwn/MDsveX/commit/eefaff563e6ce05026f92c03fce21b3ba4bd5e77), [`3f5bbbb`](https://github.com/pngwn/MDsveX/commit/3f5bbbb069ca12e16b3bb96afb60c41362161109), [`60da683`](https://github.com/pngwn/MDsveX/commit/60da68313df11747bdd6235dffc325c30af60cb2), [`65c9784`](https://github.com/pngwn/MDsveX/commit/65c9784b51209c7706eebaada3e9908bda9d5fa4), [`585a698`](https://github.com/pngwn/MDsveX/commit/585a698f25fd0b6160e25bf0022e3cdabde65172), [`585a698`](https://github.com/pngwn/MDsveX/commit/585a698f25fd0b6160e25bf0022e3cdabde65172), [`9903c3a`](https://github.com/pngwn/MDsveX/commit/9903c3ad8d764085285486816736c4f3ea140a99), [`2f981d8`](https://github.com/pngwn/MDsveX/commit/2f981d84b04a718dae82f79e6a9243868444f88c), [`cbc0029`](https://github.com/pngwn/MDsveX/commit/cbc00291119021655765fd4f4e05d9f4fb320727)]:
  - @mdsvex/parse@1.0.0-next.1

### Major Changes

- [#795](https://github.com/pngwn/MDsveX/pull/795) [`6ac3826`](https://github.com/pngwn/MDsveX/commit/6ac382615eb410230e8423d5ca4202005588869e) Thanks [@pngwn](https://github.com/pngwn)! - Add new PFM parser, renderers

### Minor Changes

- [#798](https://github.com/pngwn/MDsveX/pull/798) [`e5b7abe`](https://github.com/pngwn/MDsveX/commit/e5b7abe1ebf868b1df1e934fb96e1e363696f3e9) Thanks [@pngwn](https://github.com/pngwn)! - Add plugin system and autolink plugin

- [#799](https://github.com/pngwn/MDsveX/pull/799) [`5b54692`](https://github.com/pngwn/MDsveX/commit/5b54692d6c895f02c947ce620a46c7a9beb856e9) Thanks [@pngwn](https://github.com/pngwn)! - Add language tools

### Patch Changes

- Updated dependencies [[`6ac3826`](https://github.com/pngwn/MDsveX/commit/6ac382615eb410230e8423d5ca4202005588869e), [`46f655f`](https://github.com/pngwn/MDsveX/commit/46f655f90a838726eda34e1b07667e86fa61e7cb), [`e5b7abe`](https://github.com/pngwn/MDsveX/commit/e5b7abe1ebf868b1df1e934fb96e1e363696f3e9), [`5b54692`](https://github.com/pngwn/MDsveX/commit/5b54692d6c895f02c947ce620a46c7a9beb856e9)]:
  - @mdsvex/parse@1.0.0-next.0
