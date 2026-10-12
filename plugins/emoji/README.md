# @mdsvex/plugin-emoji

Emoji shortcodes for [mdsvex](https://mdsvex.pngwn.io): `:tada:` becomes the emoji, with an optional accessible label.

```bash
pnpm add --save-dev @mdsvex/plugin-emoji@next
```

```js
// vite.config.js
import { mdsvex } from 'mdsvex';
import { emoji } from '@mdsvex/plugin-emoji';

export default {
	plugins: [mdsvex({ plugins: [emoji()] })],
};
```

```md
We shipped it :tada: and nobody was paged :+1:
```

```html
<p>We shipped it 🎉 and nobody was paged 👍</p>
```

## Which shortcodes

The 1913 shortcodes GitHub uses, for 1870 emoji: `:tada:`, `:+1:`, `:rocket:`, `:white_check_mark:`. The table is built into the package, so there is nothing else to install. It comes from [`gemoji`](https://github.com/wooorm/gemoji) 8.1.0 (MIT), which follows [GitHub's own list](https://github.com/github/gemoji) (MIT). The built file is 64 kB, 24 kB compressed, and it only runs at build time.

A shortcode is a colon, a name and a colon, and the name is written exactly as in the table, in lower case. What is not a shortcode stays as you wrote it:

- **A name the table does not have:** `:not_an_emoji:`.
- **A name that touches a letter or a digit on either side.** So a time or a ratio is safe, `10:30:00` and `1:100:1`, though `:100:` on its own is an emoji. So is `key:value:other`.
- **A shortcode you escaped:** `\:tada:` is the text `:tada:`.
- **An inline directive.** `:tada[text]` is a directive, because its name is followed by a bracket, and `:tada:` is a shortcode, because it is followed by a colon. Neither is read as the other, and a shortcode inside the brackets of a directive is replaced like any other text.

## Where it looks

In prose: paragraphs, headings, list items, table cells, block quotes, and the text of emphasis, links, directives and elements.

Never in code spans, code blocks, math, comments, `{expressions}`, the value of an attribute, the url or title of a link, the alt text of an image, or the content of `script`, `style`, `pre`, `textarea`, `code`, `kbd`, `samp`, `var` and `tt`. The text of an autolink (`<https://example.com/:tada:>`) is its url and is left alone too.

A [heading id](https://mdsvex.pngwn.io/docs#heading_ids) is made from what you wrote, so `## Done :tada:` gets the id `done-tada`.

## Options

```ts
emoji({
	table: Record<string, string>,
	extend: Record<string, string | null>,
	label: boolean | ((emoji: string, name: string | undefined) => string | undefined),
	attrs: Record<string, string>,
});
```

### `extend`

More shortcodes on top of the table. One with a name the table has replaces it, and `null` takes one out:

```js
emoji({
	extend: {
		shipit: '🐿️',
		// a ratio written with spaces, 1 :100: 1, stays a ratio
		100: null,
	},
});
```

A name is letters, digits, `_`, `+` and `-`, without its colons. What it becomes is text: it can be any string, and markup in it is shown, not rendered.

### `table`

The whole table, in place of the built in one. `extend` then adds to it.

```js
emoji({ table: { ok: '👌', no: '🚫' } });
```

### `label`

Wraps each emoji in a `<span>` with a name for a screen reader:

```js
emoji({ label: true });
```

```html
<p>We shipped it <span role="img" aria-label="party popper">🎉</span></p>
```

- **`true`** uses the description that comes with the table, which is the Unicode name of the emoji. A shortcode you added with `extend` is named after itself, `ship it` for `:ship_it:`.
- **A function** gives the label. It gets the emoji and the shortcode it was written with, and an emoji it returns nothing for gets no `role` and no label. Use it for a page that is not in English:

```js
emoji({ label: (emoji, name) => names_in_french[emoji] });
```

- **Emoji you typed as characters are wrapped too,** since a reader can't hear the difference. The shortcode is `undefined` for those. A variant with a skin tone has the name of its emoji.

Screen readers already read an emoji by its Unicode name, so the label is for a name that suits the sentence better, or a language the reader's software does not cover.

### `attrs`

Attributes for a `<span>` around each emoji, with or without a label. One with the name of a default replaces it.

```js
emoji({ attrs: { class: 'emoji' } });
```

```html
<span class="emoji">🎉</span>
```

## What it does not do

- **Emoticons.** `:)` and `:-D` stay as they are.
- **Images.** It writes the character, and the reader's system font draws it. For Twemoji or another image set, give `attrs` a class and style the span, or replace the character in `table`.
- **Skin tone shortcodes.** GitHub has none. Type the emoji, or add the ones you use with `extend`.

## With other plugins

The plugin reads the finished tree, so text another plugin wrote is seen too. Put it after a plugin that turns urls into links, such as [`@mdsvex/plugin-references`](../references) with `linkify`, so a url that holds a shortcode is a link before this plugin looks.

`smart_punctuation` still curls the quotes around an emoji.

## With `compile`

```js
import { compile } from 'mdsvex';

compile(source, { plugins: [emoji()] });
```
