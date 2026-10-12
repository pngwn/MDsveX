# @mdsvex/plugin-external-links

External link policy for [mdsvex](https://mdsvex.pngwn.io): `rel` and `target` on every markdown link that leaves the site.

```bash
pnpm add --save-dev @mdsvex/plugin-external-links@next
```

```js
// vite.config.js
import { mdsvex } from 'mdsvex';
import { external_links } from '@mdsvex/plugin-external-links';

export default {
	plugins: [mdsvex({ plugins: [external_links()] })],
};
```

```md
Read [the spec](https://example.com/spec), then [the guide](/guide).
```

```html
<p>
	Read
	<a href="https://example.com/spec" rel="noopener noreferrer">the spec</a>,
	then <a href="/guide">the guide</a>.
</p>
```

## Which links are external

A link is external when its url is absolute, with an `http:` or `https:` scheme, or protocol relative (`//cdn.example.com/x`), and its host is not one of [`internal_hosts`](#internal_hosts). Autolinks (`<https://example.com>`) count like any other link.

Everything else is left exactly as it was written:

- relative urls (`/docs`, `./guide.md`, `guide`), fragments (`#install`) and queries
- other schemes: `mailto:`, `tel:`, `ftp:` and the rest
- **a url whose host comes from a Svelte expression**, such as `{url}`, `{base}/docs` or `https://{host}/docs`. The plugin runs at build time and can't know where those go. An expression after the host is fine: `https://example.com/{slug}` is external.

## What it does not see

The plugin sees markdown links. It does not see:

- **an `<a href>` you typed as HTML.** That is an HTML element, not a link node, and it is rendered as you wrote it. Add `rel` and `target` to it by hand.
- a link a component renders, or one inside `{@html ...}`.

It is not a sanitiser. It adds attributes to links and removes nothing.

## Options

```ts
external_links({
	target: string,
	rel: string | string[], // ['noopener', 'noreferrer']
	internal_hosts: string[],
	is_external: (href: string, external: boolean) => boolean,
	attrs: Record<string, string>,
	icon: boolean | Record<string, string>,
	new_tab_label: string,
});
```

### `target`

Not set by default, so an external link opens where the reader chooses, like any other link. Set it to open a new tab:

```js
external_links({ target: '_blank' });
```

A link that already has a `target`, from another plugin, keeps it.

### `rel`

The tokens are added to the ones a link already has, and none is written twice. The default is `noopener noreferrer`:

- **`noreferrer`** keeps the address of your page out of the request to the other site.
- **`noopener`** stops the page you open from reaching back through `window.opener`. Current browsers imply it for `target="_blank"`, and `noreferrer` implies it too. It is written out for older browsers, and so that turning `target` on later needs no second change.
- **`nofollow` is not there.** It tells a search engine not to trust the link, which suits links your users wrote, not ones you did. Add it, or `ugc`, when that is what the links are:

```js
external_links({ rel: ['nofollow', 'ugc', 'noopener'] });
```

`rel: []` adds none.

### `internal_hosts`

Hosts that are your own site. A link to one is not external:

```js
external_links({ internal_hosts: ['example.com', 'www.example.com'] });
```

A host is compared whole, without its port and in any case. `example.com` does not cover `www.example.com`, so list each one, or use `is_external`.

### `is_external`

Decides for each link in place of the built in test, whose answer is the second argument. It is called for every link, the ones with expressions included:

```js
external_links({
	// a pdf opens like an external link
	is_external: (href, external) => external || href.endsWith('.pdf'),
});
```

### `attrs`

More attributes for an external link, such as a class. One with the name of an attribute the link has replaces it.

```js
external_links({ attrs: { class: 'external' } });
```

### `icon`

Appends an empty `<span>` to each external link, after its content, for a stylesheet to draw an icon in. `true` gives it `class="external-link-icon"`, and an object is its attributes.

```js
external_links({ icon: true });
```

```html
<a href="https://example.com" rel="noopener noreferrer"
	>the spec<span class="external-link-icon" aria-hidden="true"></span
></a>
```

```css
.external-link-icon::after {
	content: '\2197';
	margin-inline-start: 0.15em;
}
```

### `new_tab_label`

What a screen reader says after a link that opens a new tab. It needs a `target` that opens one, and throws without it.

```js
external_links({
	target: '_blank',
	icon: true,
	new_tab_label: 'opens in a new tab',
});
```

```html
<a href="https://example.com" rel="noopener noreferrer" target="_blank"
	>the spec<span
		class="external-link-icon"
		role="img"
		aria-label="opens in a new tab"
	></span
></a>
```

The label is the name of the span, which is read out as part of the link, the way the `alt` of an icon would be: "the spec, opens in a new tab". With `icon` the same span carries both. Without it the span has no class and draws nothing. The label is an attribute and not hidden text because a plugin can't add text to a document yet.

There is no default label, since the plugin can't know the language of the page.

## With other plugins

The plugin reads the finished tree, so it sees every link whatever the order of `plugins`, and it works beside [`@mdsvex/plugin-anchors`](../anchors) and [`@mdsvex/plugin-steps`](../steps) in any order. A heading anchor links to a fragment, so it is never external.

A [replaced `a`](https://mdsvex.pngwn.io/docs#custom-components) gets `rel` and `target` as props.

## With `compile`

```js
import { compile } from 'mdsvex';

compile(source, { plugins: [external_links()] });
```
