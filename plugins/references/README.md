# @mdsvex/plugin-references

References for [mdsvex](https://mdsvex.pngwn.io): `@user`, `#123`, `owner/repo#123` and commit hashes become links, and bare urls do too when you ask.

```bash
pnpm add --save-dev @mdsvex/plugin-references@next
```

```js
// vite.config.js
import { mdsvex } from 'mdsvex';
import { references } from '@mdsvex/plugin-references';

export default {
	plugins: [mdsvex({ plugins: [references({ repo: 'sveltejs/svelte' })] })],
};
```

```md
Thanks @ada for #123, which also closes sveltejs/kit#45. Landed in a1b2c3d.
```

```html
<p>
	Thanks <a href="https://github.com/ada">@ada</a> for
	<a href="https://github.com/sveltejs/svelte/issues/123">#123</a>, which also
	closes <a href="https://github.com/sveltejs/kit/issues/45">sveltejs/kit#45</a>.
	Landed in
	<a href="https://github.com/sveltejs/svelte/commit/a1b2c3d"><code>a1b2c3d</code></a>.
</p>
```

## What is a reference

| written | becomes a link to | needs |
| --- | --- | --- |
| `@user` | the user | |
| `owner/repo#123` | that issue or pull request | |
| `#123` | the issue or pull request in your repo | `repo` |
| `a1b2c3d`, 7 to 40 characters of a commit hash | the commit in your repo, shown as its first 7 characters in a `<code>` | `repo` |
| `https://example.com`, `www.example.com` | itself | `linkify: true` |

The urls are GitHub's unless you give [your own](#mention-issue-and-commit). GitHub sends an `/issues/` url of a pull request to the pull request, so one template serves both.

A reference has to stand on its own. It is not one when it follows a letter, a digit or one of `_ / @ # & . + -`, or when a letter or a digit follows it. So these are left as you wrote them:

- an email address, `me@example.com`
- part of a path or a url, `/@ada`, `page#12`
- a numeric character reference, `&#35;`
- `#12abc`, `#1.5`, and `@user_name`, which is not a GitHub user name
- `@org/team`
- a hash that is all letters or all digits, `defaced` and `1234567`, or that has a capital in it
- a reference you escaped, `\@ada` and `\#12`

## Where it looks

In prose: paragraphs, headings, list items, table cells, block quotes, and the text of emphasis, directives and elements.

Never in code spans, code blocks, math, comments, `{expressions}`, the value of an attribute, the url or title of a link, the alt text of an image, or the content of `script`, `style`, `pre`, `textarea`, `code`, `kbd`, `samp`, `var` and `tt`.

**Never inside a link.** The text of a markdown link, of an autolink and of an `<a>` you typed is left alone, at any depth, since a link in a link is not valid HTML.

## Bare urls

The mdsvex parser does not make a link of a bare url. That is a decision, not a gap: in PFM a url is a link when you mark it as one, `<https://example.com>`, and text that merely looks like a url stays text. This plugin is where you opt in:

```js
references({ linkify: true });
```

```md
Docs are at www.example.com/docs (or https://example.com/guide).
```

```html
<p>
	Docs are at <a href="https://www.example.com/docs">www.example.com/docs</a>
	(or <a href="https://example.com/guide">https://example.com/guide</a>).
</p>
```

- **What counts:** `https://` or `http://` and a host, or `www.` and a host with a dot in it. No other scheme, and no email address.
- **Where it ends:** at a space or a `<`. Punctuation at the end, one of `? ! . , : * _ ~ ' "`, belongs to the sentence and not to the url. So does a closing bracket the url did not open, and a character reference such as `&copy;`. These are the rules GitHub uses.
- **`www.` gets `https://`.**
- **Characters markdown reads stay in the url.** An underscore, a star or a tilde inside it does not start emphasis, because the parser found none to close it. A url that does hold a closed pair, such as `https://x.io/*a*`, is emphasis to the parser, and the plugin then sees two pieces of text. Write that one as `<https://x.io/*a*>`.
- **An `{expression}` ends it,** since an expression is not text: `https://example.com/{slug}` links `https://example.com/` and the value follows the link. Write that one as a markdown link, `[the page](https://example.com/{slug})`.
- **Nothing inside a url is a reference,** with `linkify` on or off: `https://example.com/@ada/issues#12` has no mention and no issue.

## Options

```ts
references({
	repo: string,
	mention: string | false | ((parts: { user }) => string | undefined),
	issue: string | false | ((parts: { repo, owner, name, number }) => string | undefined),
	commit: string | false | ((parts: { repo, owner, name, sha }) => string | undefined),
	linkify: boolean,
	attrs: Record<string, string> | ((kind) => Record<string, string> | undefined),
});
```

### `repo`

The repository a bare `#123` and a commit hash belong to, as `owner/name`. Without it neither is linked, and `@user` and `owner/repo#123` still are.

### `mention`, `issue` and `commit`

The url of each kind of reference. The defaults are GitHub's:

```js
references({
	mention: 'https://github.com/{user}',
	issue: 'https://github.com/{repo}/issues/{number}',
	commit: 'https://github.com/{repo}/commit/{sha}',
});
```

- **A string** is a url with placeholders: `{user}` for a mention, `{repo}`, `{owner}`, `{name}` and `{number}` for an issue, and `{repo}`, `{owner}`, `{name}` and `{sha}` for a commit. `{repo}` is `owner/name`. A placeholder the template does not take throws when the plugin is made.
- **A function** gets the same parts and returns the url. When it returns nothing the reference stays text, which is how you link only the users you know:

```js
references({
	mention: ({ user }) => (team.has(user) ? `/team/${user}` : undefined),
});
```

- **`false`** turns that kind off.

For another host, give all three:

```js
references({
	repo: 'group/project',
	mention: 'https://gitlab.com/{user}',
	issue: 'https://gitlab.com/{repo}/-/issues/{number}',
	commit: 'https://gitlab.com/{repo}/-/commit/{sha}',
});
```

### `linkify`

See [Bare urls](#bare-urls). Off by default.

### `attrs`

Attributes for every link the plugin makes, such as a class. A function gets the kind of reference, `'mention'`, `'issue'`, `'commit'` or `'url'`, and returns the attributes for it:

```js
references({
	attrs: (kind) => (kind === 'mention' ? { class: 'mention' } : undefined),
});
```

## What it does not do

- **It does not check that a user, an issue or a commit exists.** `@nobody` gets a link like any other name. A parse plugin can't make a request.
- **No `GH-123`, no `user@sha` and no `owner/repo@sha`,** which GitHub also reads.
- **No team mentions.** `@org/team` is left as text.
- **A full url of an issue is not shortened.** `https://github.com/sveltejs/svelte/issues/123` stays as it is, or becomes a link to itself with `linkify`.

## With other plugins

The plugin reads the finished tree, so text another plugin wrote is seen too.

- Put it **before** [`@mdsvex/plugin-emoji`](../emoji) when `linkify` is on. The emoji plugin leaves the text of a link that is its url alone, so `https://example.com/:tada:/` keeps its shortcode. The other way round the shortcode is replaced before the url is seen.
- [`@mdsvex/plugin-anchors`](../anchors) in its default `wrap` mode puts the content of a heading in a link. Listed before this plugin, a heading gets its anchor and no references. Listed after, a heading with a reference in it gets no anchor, since it already holds a link.
- [`@mdsvex/plugin-external-links`](../external-links) does not see the links this plugin makes, wherever it is listed. It reads each link while the document is parsed, and these are made afterwards. Give them the same attributes with [`attrs`](#attrs): `attrs: { rel: 'noopener noreferrer' }`.

## The name

`references` covers mentions, issues, commits and bare urls, which is why it is not `github` or `linkify`. The package name and the name of the export are the only places it is written.

## With `compile`

```js
import { compile } from 'mdsvex';

compile(source, { plugins: [references({ repo: 'sveltejs/svelte' })] });
```
