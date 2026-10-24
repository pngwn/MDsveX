# @mdsvex/plugin-link-check

Link checking for [mdsvex](https://mdsvex.pngwn.io): a warning at every link to an id or a document that is not there.

```bash
pnpm add --save-dev @mdsvex/plugin-link-check@next
```

```js
// vite.config.js
import { mdsvex } from 'mdsvex';
import { link_check } from '@mdsvex/plugin-link-check';

export default {
	plugins: [
		mdsvex({
			heading_ids: true,
			links: { routes: 'src/routes' },
			plugins: [link_check({ routes: 'src/routes' })],
		}),
	],
};
```

```md
# Install

See [the setup](#setup), [the guide](../guide/+page.md#usage) and [the api](/api#options).
```

```
#setup links to no element of this document, none has the id "setup"
../guide/+page.md#usage links to src/routes/guide/+page.md, which has no element with the id "usage"
```

Each is a warning of the compile, at the line of the link, which the Vite plugin shows in the terminal.

## What is checked

- **`#id` within a page**, against every id the document gives an element: the ids of headings, which the [`heading_ids`](https://mdsvex.pngwn.io/docs#heading_ids) option makes, an `id` typed on an element, the `name` of an `<a>`, the `id` arg of a directive, the `fn-` id of each footnote, and an id a plugin set on a node. An id can come after the link to it. `#top` and `#` need none.
- **Other documents by file**, `./guide.md` and `./guide.md#usage`, relative to the document. A file that does not exist is a warning, and so is an id it does not have.
- **Other documents by route**, `/guide#usage`, when `routes` names the directory of your routes, as the `links.routes` option of mdsvex does. The route is looked for as `guide.md`, `guide/+page.md` and `guide/index.md`, with each extension. A route with no such document is not reported, since it may be a Svelte page, and neither is one inside a `(group)` or with a `[param]`. A root url with no fragment is not checked.
- **A link to the document itself**, by file or by route, is checked as a link within it.

Not checked: urls with a scheme, a link written as html (`<a href>`), a url with a Svelte expression, and relative links to anything but a document, such as an image or `./guide` with no extension.

An id that a component makes as it renders is not in the tree, so a link to one is reported. Skip those with `ignore`.

## How other documents are read

Each linked document is read with `ctx.read` and compiled once, for its ids, with `ctx.cached`, so every document a compiler takes shares one read of it. The linked file becomes a dependency of the document that links to it:

- **In the dev server**, change the headings of `guide.md` and every document that links to it compiles again and warns about what now goes nowhere. A file that did not exist is watched too, so creating it checks the link again.
- **In a build**, every document is compiled once and each linked document read once.
- **In a script**, `compile_async` with a `read` option does the same, and keeps what it read for as long as you pass the same `plugins` array. A host that compiles again when files change calls `invalidate` on its `CompilerSession` with the paths that changed.

The headings of another document get ids as `heading_ids` says, so give the plugin the value you give mdsvex when that is not `true`. A plugin cannot read the options of the compile.

Reading happens while the document compiles, so the Vite plugin and `compile_async` check other documents, and `compile` throws a `PluginAsyncError` for a document that links to one. `documents: false` checks links within a page alone, and works under `compile`.

## Options

```ts
link_check({
	documents: boolean, // true, check links to other documents too
	heading_ids: boolean | { slug }, // true, how the headings of other documents get ids
	routes: string, // the directory whose documents are routes, absolute or relative to the working directory
	extensions: string[], // ['.md', '.svx'], what a document is
	base: string, // the base path, a root url written with it has it taken off
	ignore: (href: string, filename: string | undefined) => boolean, // true skips a url
	strict: boolean, // false, fail the compile with a LinkCheckError
});
```

## Failing a build

`strict` fails a document that has a link that goes nowhere with a `LinkCheckError`, after the warnings. Its `links` lists each one with its line and column. Turn it on for a build and leave the dev server warning:

```js
export default defineConfig(({ command }) => ({
	plugins: [mdsvex({ plugins: [link_check({ strict: command === 'build' })] })],
}));
```

## Streaming

A link to another document is looked up in a deferred task, started when the link closes, so the lookups run while the rest of the document is parsed. A link the parser revokes, such as `[text](./guide.md` with no closing parenthesis, takes its task and its warning with it. Links within a page are checked once the whole document is there, in the document hook, because an id can come after the link to it. Nothing here changes what a page shows, so a streaming view has nothing to render from it.
