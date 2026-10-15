# @mdsvex/plugin-page-data

Facts about each [mdsvex](https://mdsvex.pngwn.io) document, for its template and for pages that list documents: a reading time and word count, an excerpt, a title read from the first heading, an edit url, and the date it was last changed.

```bash
pnpm add --save-dev @mdsvex/plugin-page-data@next
```

```js
// vite.config.js
import { mdsvex } from 'mdsvex';
import { page_data } from '@mdsvex/plugin-page-data';

export default {
	plugins: [
		mdsvex({
			plugins: [
				page_data({
					edit_url: 'https://github.com/you/site/edit/main/',
					last_modified: 'git',
				}),
			],
		}),
	],
};
```

```md
# Moving to runes

Signals changed how I write components. Here is what I learned.

## State

...
```

```js
import Post, { plugin_data } from './moving-to-runes.svx';

plugin_data.page;
// {
//   title: 'Moving to runes',
//   excerpt: 'Signals changed how I write components. Here is what I learned.',
//   words: 842,
//   minutes: 5,
//   edit_url: 'https://github.com/you/site/edit/main/src/routes/blog/moving-to-runes.svx',
//   last_modified: '2026-10-15T09:30:00.000Z',
// }
```

Everything is under one key, `plugin_data.page`, and each part can be turned off. A key is only there when its part is on and found something. It reaches a page the three ways all [plugin data](https://mdsvex.pngwn.io/docs#plugin-data) does: the `plugin_data` export of the document, the `plugin_data` prop of its template, and a `?data` import. The package types the key, by adding to the `PluginData` interface of mdsvex. That is in effect once TypeScript sees an import of the package, which a `vite.config.ts` gives it. With a config it does not check, add `import type {} from '@mdsvex/plugin-page-data';` to a declaration file such as `src/app.d.ts`.

`metadata` is not touched. It stays exactly the frontmatter.

## Options

```ts
page_data({
	reading_time: boolean | { words_per_minute: number }, // true, 200
	excerpt: boolean | { max_length: number, ellipsis: string }, // true, no limit, '…'
	title: boolean, // true
	edit_url:
		string |
		{ base: string, root: string } |
		((filename: string) => string | undefined), // off
	last_modified:
		'git' | 'fs' | ((filename: string) => Promise<string | Date | undefined>), // off
});
```

An option of the wrong shape throws a `PageDataError` when the plugin is made, with `code` set to `'option'`.

## Reading time

`words` is the number of words in the prose of the document, and `minutes` is the time to read them.

- **Prose is the text a reader reads**: headings, paragraphs, list items, block quotes, table cells, footnotes, the labels of directives, and what an element, a component or a `{#if}` block holds.
- **Not counted**: code blocks, the alt of an image, comments, `{expressions}`, HTML attributes, link urls and titles, `<script>` and `<style>`.
- **Code in a sentence is counted**, since `` `npm install` `` is read as part of it.
- **A word is a run of characters between spaces**, so `well-known` is one word, and markup inside a word does not split it.
- **Chinese, Japanese and Korean are written without spaces, so each of their characters is a word**: every Han ideograph, hiragana and hangul syllable. The punctuation after one is not a word. Katakana is not counted this way, a run of it is one word, as loan words are. This is the rule of the [`reading-time`](https://www.npmjs.com/package/reading-time) package, which `remark-reading-time` counts with.
- **`minutes` is rounded the way `reading-time` shows it**: `words / words_per_minute`, to two decimals, then up to a whole minute. One word is 1 minute, 200 words are 1, and 202 are 2. A document with no words has 0.

Unlike `remark-reading-time`, code blocks are left out, and the last word of a block and the first of the next are two words, not one.

```js
page_data({ reading_time: { words_per_minute: 250 } });
```

`count_words(text)` is exported, to count some other text by the same rule.

## Excerpt

`excerpt` is the first paragraph of the document, or everything before a `<!-- more -->` comment when the document has one.

```md
# Title

This paragraph is the excerpt.

This one is not.
```

```md
# Title

With the comment below, this paragraph

and this one are the excerpt.

<!-- more -->

This one is not.
```

- **It is plain text.** A parse plugin sees the document before it is rendered, so there is no HTML to give. Emphasis, links and code are their text, a character reference such as `&amp;` is its character, and the lines of a paragraph are joined with a space. For a rendered excerpt, render the start of the document in the template instead.
- **The first paragraph** is the first one with text that is not inside a block quote, a list, a table, a footnote, a container directive or a Svelte block. A paragraph that only holds an image, a component or an expression is passed over.
- **Before `<!-- more -->`** it is every block of prose, joined with spaces. Headings, code blocks, tables and footnotes are left out. The comment can be on a line of its own or inside a paragraph, which is then cut there. Only the first one counts.
- **`max_length`** is the most characters the excerpt has. A longer one is cut where a word ends and gets the `ellipsis`, which counts toward the length. Text with no spaces, such as Japanese, is cut between two characters.

```js
page_data({ excerpt: { max_length: 160 } });
```

## Title

`title` is the text of the first `#` heading, for a document whose frontmatter has no `title`:

```svelte
<script>
	let { title, plugin_data, children } = $props();
</script>

<svelte:head>
	<title>{title ?? plugin_data?.page?.title}</title>
</svelte:head>
```

- It is only set when the frontmatter has no `title`, or an empty one. A title you wrote is in `metadata` and is never copied.
- The heading is one that is not inside a block quote, a list or a container directive.
- The text is what a reader sees, without markup. A heading that is only an expression, such as `# {title}`, has no text and is passed over.

## Edit url

`edit_url` is where the source of the document can be edited. It is off until you give it a base:

```js
page_data({ edit_url: 'https://github.com/you/site/edit/main/' });
// /home/you/site/src/routes/blog/post.svx
// https://github.com/you/site/edit/main/src/routes/blog/post.svx
```

- **The path is the file of the document relative to `root`**, which is the working directory by default. In a monorepo, where the app is not at the root of the repository, name the root, or put the directory of the app in the base:

```js
page_data({
	edit_url: {
		base: 'https://github.com/you/repo/edit/main/',
		root: fileURLToPath(new URL('../..', import.meta.url)),
	},
});
```

- **A function** gets the path of the document and returns the url, or nothing for no url.
- A document outside the root has no `edit_url`, and the build warns `outside_root`. With `compile()` and no `filename` there is none either, and the warning is `no_filename`.

## Last modified

`last_modified` is when the document last changed, as an ISO string in UTC. It is off until you say where the date comes from:

```js
page_data({ last_modified: 'git' });
// '2026-10-15T09:30:00.000Z'
```

- **`'git'`** is the date of the last commit that touched the file, its committer date, which is when the change landed on the branch. A file that is not committed yet has no date.
- **`'fs'`** is the modification time of the file.
- **A function** is given the path of the document and returns a `Date`, a string a `Date` can read, or nothing for no date. It can be async. Anything else rejects with a `PageDataError` whose `code` is `'option'`.

```js
page_data({
	last_modified: async (filename) => (await cms.page(filename))?.updated_at,
});
```

Finding the date waits, so a document with `last_modified` on needs a compile that waits. The Vite plugin waits, and so does `compile_async` from `mdsvex`. `compile` throws a `PluginAsyncError` for it, which is how mdsvex says a plugin has async work.

### Where it works

`'git'` and `'fs'` need Node, which they import when they first run, so the package still loads in a browser. Chosen where there is no Node, in the playground for instance, they throw a `PageDataError` with `code` set to `'node'` when the plugin is made. A function works anywhere.

`'git'` runs `git`. When git can not be run, or a document is not inside a git repository, the compile fails with a `PageDataError` whose `code` is `'git'`. A file that is not there gives no date and the warning `not_found`, with either. With no `filename` there is no date and the warning is `no_filename`.

### How `'git'` reads the history

It runs one `git log` for the whole repository and keeps the date of each file, shared by every document the compiler takes (the dev server, a build, or a `compile_async` given the same `plugins` array each time). On this repository, 1,064 commits, that is one process of about 90 ms against 25 ms for each file with one `git log` per file, which is 45 seconds for its 1,513 markdown files, or 8 with eight at once. A repository with a very long history pays more for the one log, but still once.

- **A shallow clone** has no history before its cut, and CI checks out one commit by default. A file whose last commit is the cut gets no date and the warning `shallow_history`, never the date of the cut. Fetch the whole history, `fetch-depth: 0` with `actions/checkout`.
- **In the dev server** the history is read once. A commit made while it runs shows after a restart. The date you see while writing is the one of the last commit either way, since what you are changing is not committed.
- **`'fs'` in CI** is the time of the checkout for every file, so it suits a site built where it is written.

## An index page

A `?data` import parses a document and runs its plugins without rendering it, so a list of posts does not load every post:

```svelte
<!-- src/routes/blog/+page.svelte -->
<script>
	const posts = import.meta.glob('./*/+page.svx', { query: '?data', eager: true });
</script>

<ul>
	{#each Object.entries(posts) as [path, { metadata, plugin_data }] (path)}
		<li>
			<a href="/blog/{path.split('/')[1]}">{metadata?.title ?? plugin_data?.page?.title}</a>
			<span>{plugin_data?.page?.minutes} min read</span>
			<p>{plugin_data?.page?.excerpt}</p>
		</li>
	{/each}
</ul>
```

## With `compile`

```js
import { compile } from 'mdsvex';

const { data } = compile(source, {
	filename: '/home/you/site/post.svx',
	plugins: [page_data()],
});
data?.page;
```

An empty document has no `page` key, or only `last_modified`. The data is the same from a tree built over the wire format.

With `last_modified`, use `compile_async`, and pass the same `plugins` array to each call so the history of `'git'` is read once:

```js
import { compile_async } from 'mdsvex';

const plugins = [page_data({ last_modified: 'git' })];
for (const file of files) {
	const { data } = await compile_async(await readFile(file, 'utf8'), {
		filename: file,
		plugins,
	});
}
```
