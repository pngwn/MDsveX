# @mdsvex/plugin-toc

## 0.1.0-next.0

### Minor Changes

- [#1113](https://github.com/pngwn/MDsveX/pull/1113) [`8009c9b`](https://github.com/pngwn/MDsveX/commit/8009c9b1e27acafa174b01636f292770aabcb35a) Thanks [@pngwn](https://github.com/pngwn)! - New package: a table of contents. It leaves the headings of each document in its plugin data, as a flat list with the depth, id, text and source position of each.

  ```js
  import { toc } from '@mdsvex/plugin-toc';

  mdsvex({ heading_ids: true, plugins: [toc()] });
  ```

  ```js
  import Page, { plugin_data } from './getting-started.svx';

  plugin_data.toc.headings;
  // [{ depth: 2, id: 'install', text: 'Install', position: { start, end } }, ...]
  ```

  - It needs `heading_ids` and makes no ids of its own. With the option off, the compile of a document that has a heading to list fails with a `TocError`.
  - `min_depth` and `max_depth` choose the depths, 2 and 3 by default. A `<!-- no-toc -->` comment in a heading leaves that heading out.
  - `toc_tree(headings)` nests the list, and `@mdsvex/plugin-toc/Toc.svelte` renders it as nested links, for a template to put in a sidebar. It needs Svelte 5.20 or later.
  - `::toc` on a line of its own renders the same component in the document, with the headings after it included. `::toc[On this page]` gives it a label and `::toc(max_depth=2)` narrows it.
  - The build warns about a heading that skips a level, a heading left out because it has no id, and a `::toc` with nothing to list.

- [#1192](https://github.com/pngwn/MDsveX/pull/1192) [`0781256`](https://github.com/pngwn/MDsveX/commit/0781256f48e1042dfcf02ad1ce1a92f06777bfbe) Thanks [@pngwn](https://github.com/pngwn)! - The table of contents grows as a document streams. Each heading is added to `plugin_data.toc.headings` as it closes, and the `::toc` component reads the list from the data of the document, so a streaming view shows it filling in as headings arrive instead of after the stream ends. A compiled document lists the same headings as before.

  A `toc` component from your own directives module no longer gets `headings` as a prop. It reads them from the context:

  ```svelte
  <script>
  	import { getContext } from 'svelte';
  	const data = getContext(Symbol.for('mdsvex.plugin_data'));
  </script>

  {#each data?.current?.toc?.headings ?? [] as heading}
  	<a href="#{heading.id}">{heading.text}</a>
  {/each}
  ```

  Warnings come in document order.

### Patch Changes

- [#1224](https://github.com/pngwn/MDsveX/pull/1224) [`548f7c4`](https://github.com/pngwn/MDsveX/commit/548f7c4b57624646be0456dc6347a37fbcdcf114) Thanks [@pngwn](https://github.com/pngwn)! - The declarations of the `Tabs`, `Tab`, `Toc`, `Cite` and `Bibliography` components name their prop types in full. They used `Snippet`, `ClassValue` and the plugin's own types without importing them, an error with `skipLibCheck` off and `any` props with it on.

- [#1172](https://github.com/pngwn/MDsveX/pull/1172) [`c340fa5`](https://github.com/pngwn/MDsveX/commit/c340fa5cbe8bcd208f3b1c2784d10dedd0278736) Thanks [@pngwn](https://github.com/pngwn)! - Plugins write their data with `ctx.set(key, value)` and `ctx.add(key, value)`, and `ctx.data` is read-only:

  ```js
  heading: {
  	parse(node, ctx) {
  		return () => ctx.add('headings', { depth: node.depth, text: node.text_content });
  	},
  }
  ```

  - Every write belongs to the node whose handler made it, and a revoke takes back exactly that node's writes, whatever they were.
  - `add` keeps a list in document order, whatever order the handlers ran in. Of two nodes that `set` one key, the later one in the document wins. Writes from a sequential pass come after the rest.
  - A value is checked when it is written: one JSON cannot hold throws a `PluginDataError` with the plugin, the key, the path of the value and where the node is. It is copied and frozen.
  - Assigning to `ctx.data` throws a `TypeError` that names `ctx.set`.
  - `PluginDispatcher.on_data(listener)` follows each change to the data, a write or a revoke, with the value of the key after it.

  `@mdsvex/plugin-toc` and `@mdsvex/plugin-page-data` write with the new calls, with their output unchanged.

- [#1168](https://github.com/pngwn/MDsveX/pull/1168) [`6e2aaae`](https://github.com/pngwn/MDsveX/commit/6e2aaae1b2f659477431682fb02b5f023889699e) Thanks [@pngwn](https://github.com/pngwn)! - The plugins' types no longer need Vite installed. A project that compiles with `mdsvex/compile` and no Vite type-checks without `skipLibCheck`.

- Updated dependencies [[`6e921ad`](https://github.com/pngwn/MDsveX/commit/6e921adadb13a01894c48a1a8ba8e4cbac1a5016), [`6c5901c`](https://github.com/pngwn/MDsveX/commit/6c5901c1eb87d10a2f43c835a10930a9dd5c0d27), [`364b172`](https://github.com/pngwn/MDsveX/commit/364b17205ef9a73e0fb037b7da0b217018cc097d), [`89bf377`](https://github.com/pngwn/MDsveX/commit/89bf3776a22003ab42517b9b8a542507fce6f03b), [`db7cea1`](https://github.com/pngwn/MDsveX/commit/db7cea19de7338a575d111f5b65642868dcaab17), [`d8f5f34`](https://github.com/pngwn/MDsveX/commit/d8f5f34b8e1fc503268850c2eaeec62866f95bf0), [`ae0c24d`](https://github.com/pngwn/MDsveX/commit/ae0c24d53beab1c05f0c9074cd11edcabcd692ca), [`47197f7`](https://github.com/pngwn/MDsveX/commit/47197f7057de0ff90d16b9c4d407450b5f68a2ca), [`548f7c4`](https://github.com/pngwn/MDsveX/commit/548f7c4b57624646be0456dc6347a37fbcdcf114), [`b1ccd82`](https://github.com/pngwn/MDsveX/commit/b1ccd825b1cb05c59491880a112490a87b5c0d1d), [`f1f8895`](https://github.com/pngwn/MDsveX/commit/f1f88950b8213b0bcacb5d47015b0e8f60146110), [`edaaa59`](https://github.com/pngwn/MDsveX/commit/edaaa59bda7e388248428eb7b6459442c7ddd216), [`c085c85`](https://github.com/pngwn/MDsveX/commit/c085c856084f6346748a325b31fa50915413872a), [`65ebb4d`](https://github.com/pngwn/MDsveX/commit/65ebb4dc029fc1cfd391495fa96a1e683bd3db4b), [`34aae13`](https://github.com/pngwn/MDsveX/commit/34aae13494d0f7678647cba02f223f68d56e08a2), [`78c552f`](https://github.com/pngwn/MDsveX/commit/78c552f8951c9186ec5b33934477d31e6028b627), [`14e9951`](https://github.com/pngwn/MDsveX/commit/14e9951b3b9de574ca0cc9c9062b48328586f1b4), [`26244e2`](https://github.com/pngwn/MDsveX/commit/26244e20b1ec22fa31ba8e126c7157465459ab47), [`26244e2`](https://github.com/pngwn/MDsveX/commit/26244e20b1ec22fa31ba8e126c7157465459ab47), [`0c8b126`](https://github.com/pngwn/MDsveX/commit/0c8b1262437a4d22258949ad082b927c90078d98), [`56c5c71`](https://github.com/pngwn/MDsveX/commit/56c5c71c9184b7a9362ac39bd3bbaee5412813b4), [`3f7ad22`](https://github.com/pngwn/MDsveX/commit/3f7ad22711f914a27338428e8a9fbbc24c03b33e), [`4d8363d`](https://github.com/pngwn/MDsveX/commit/4d8363da5e7c19fc0486e8bbfd48da0b3477c6c0), [`636d9b9`](https://github.com/pngwn/MDsveX/commit/636d9b9c065a29007e9581151be1f6c061f256e4), [`3f8ce51`](https://github.com/pngwn/MDsveX/commit/3f8ce514f7f7cbec985bd067492d36dce2aa3212), [`6719013`](https://github.com/pngwn/MDsveX/commit/6719013bcaea57b36341eae90733d344a0c175e1), [`ad07ded`](https://github.com/pngwn/MDsveX/commit/ad07dedac075a42ed0f41c9ea1b8e156ff317cf5), [`524cf8a`](https://github.com/pngwn/MDsveX/commit/524cf8a1fe311c071aa2937950190891c43df0a0), [`9d4c1a4`](https://github.com/pngwn/MDsveX/commit/9d4c1a419c807a856aa4bed122bbb19b746b1738), [`542d604`](https://github.com/pngwn/MDsveX/commit/542d604fabf70b0dcb52b8140ed066843dc18916), [`50e0b8c`](https://github.com/pngwn/MDsveX/commit/50e0b8ccc97885e0ca7eed53c075bfaed7969b23), [`524cf8a`](https://github.com/pngwn/MDsveX/commit/524cf8a1fe311c071aa2937950190891c43df0a0), [`a02a0ae`](https://github.com/pngwn/MDsveX/commit/a02a0aefe318b90c630df9818268f5588eaf476d), [`a8473b4`](https://github.com/pngwn/MDsveX/commit/a8473b453958c8619744cb0d8c8c694f515961bc), [`9842f87`](https://github.com/pngwn/MDsveX/commit/9842f872de3f911bbaf54a56a1529d6a1445dccc), [`9a8b94d`](https://github.com/pngwn/MDsveX/commit/9a8b94da69804114e2cac93fc82cd12094592662), [`a3dc415`](https://github.com/pngwn/MDsveX/commit/a3dc415629e6ca782fa1e36687c384f56a569096), [`c37520f`](https://github.com/pngwn/MDsveX/commit/c37520f5d0ba21dc7647e4a31cedc723636a36dd), [`1e54c51`](https://github.com/pngwn/MDsveX/commit/1e54c51e1595fc8d3b04bee33fa8f83f54306645), [`a83b22f`](https://github.com/pngwn/MDsveX/commit/a83b22fd70193965102cd0bf35868d4839660675), [`6b67a44`](https://github.com/pngwn/MDsveX/commit/6b67a4478687548dc1176fe659f8c917828c67c5), [`a521675`](https://github.com/pngwn/MDsveX/commit/a52167532d3899c1900ffe81b43d9e12cbb89c87), [`a3dc415`](https://github.com/pngwn/MDsveX/commit/a3dc415629e6ca782fa1e36687c384f56a569096), [`3022559`](https://github.com/pngwn/MDsveX/commit/30225590d894496515c1dd1c5f602e790ca92e7b), [`a3dc415`](https://github.com/pngwn/MDsveX/commit/a3dc415629e6ca782fa1e36687c384f56a569096), [`c340fa5`](https://github.com/pngwn/MDsveX/commit/c340fa5cbe8bcd208f3b1c2784d10dedd0278736), [`1af6870`](https://github.com/pngwn/MDsveX/commit/1af687013416fa29fc7363216eee4daaebdb7b03), [`cfc1ab0`](https://github.com/pngwn/MDsveX/commit/cfc1ab0468d82dc54d57ff525f542402a92423ee), [`d8f5f34`](https://github.com/pngwn/MDsveX/commit/d8f5f34b8e1fc503268850c2eaeec62866f95bf0), [`290a67a`](https://github.com/pngwn/MDsveX/commit/290a67a77e13548ac001f4a34620f7721f818d10), [`290a67a`](https://github.com/pngwn/MDsveX/commit/290a67a77e13548ac001f4a34620f7721f818d10), [`36b25c3`](https://github.com/pngwn/MDsveX/commit/36b25c33a81b385a868d10d56a16edc426247f42), [`1af6870`](https://github.com/pngwn/MDsveX/commit/1af687013416fa29fc7363216eee4daaebdb7b03), [`9b8d968`](https://github.com/pngwn/MDsveX/commit/9b8d9681b17874aba4188e597c8b0d5075d155ed), [`9df619b`](https://github.com/pngwn/MDsveX/commit/9df619b02dc35693f47d4e0751df4c72f20ae491), [`e09ab81`](https://github.com/pngwn/MDsveX/commit/e09ab81451d98d6dd8d9b77f2f4409d169ae9a49), [`0462e67`](https://github.com/pngwn/MDsveX/commit/0462e678afdb484b031e7ddb4c7086fdee273f27), [`ae0c24d`](https://github.com/pngwn/MDsveX/commit/ae0c24d53beab1c05f0c9074cd11edcabcd692ca), [`fc56ba8`](https://github.com/pngwn/MDsveX/commit/fc56ba892e7068b378e350c29cfb52be6c5d48b1), [`a3b2de5`](https://github.com/pngwn/MDsveX/commit/a3b2de5e01e4e8cb2f56bf06ad6a163c035e980b), [`7dfb9c9`](https://github.com/pngwn/MDsveX/commit/7dfb9c9c7301e96e4780c03ff45b04dbee6e92c4), [`e27008d`](https://github.com/pngwn/MDsveX/commit/e27008dba1e54999c763edaf1af84ae585fba62d), [`aa06e2f`](https://github.com/pngwn/MDsveX/commit/aa06e2fdd972cfef890313d15a8a22b95d31bd2e), [`3e868eb`](https://github.com/pngwn/MDsveX/commit/3e868eb09c8a67361168725175377b7f5125a7ed), [`68e2a59`](https://github.com/pngwn/MDsveX/commit/68e2a59528b92a1c43ed961a69f10e0eaed1bee3), [`6985317`](https://github.com/pngwn/MDsveX/commit/6985317ea53b10f5cf99d6a5d6142dd6bcb31e41), [`3ca3b52`](https://github.com/pngwn/MDsveX/commit/3ca3b525050c5874ac9ff7130033fe00d0112cba), [`19fc058`](https://github.com/pngwn/MDsveX/commit/19fc05846c53942ec53ca75baabecd02ed5da076)]:
  - mdsvex@1.0.0-next.2
