# @mdsvex/plugin-callouts

Callouts for [mdsvex](https://mdsvex.pngwn.io): `:::note`, `:::tip`, `:::important`, `:::warning` and `:::caution`, GitHub's five alerts written as directives.

```bash
pnpm add --save-dev @mdsvex/plugin-callouts@next
```

```js
// vite.config.js
import { mdsvex } from 'mdsvex';
import { callouts } from '@mdsvex/plugin-callouts';

export default {
	plugins: [mdsvex({ plugins: [callouts()] })],
};
```

It needs Svelte 5. The component renders at build time, so a page gets its HTML and the stylesheet and loads no JavaScript for it. What is written inside a callout stays live: an expression or a component in it works as anywhere else.

## Writing one

```md
:::note
Highlights information that users should take into account, even when skimming.
:::

:::warning[Breaking change]
The `layout` option is now `templates`.
:::
```

```html
<div class="callout" data-kind="note" role="note">
	<p class="callout-title">
		<svg class="callout-icon" aria-hidden="true">…</svg>
		<span class="callout-title-text">Note</span>
	</p>
	<div class="callout-body"><p>Highlights information …</p></div>
</div>
```

- **The bracket text is a custom title**, with its inline markup. Without it the title is the kind's default: Note, Tip, Important, Warning or Caution.
- **Anything can go inside**: paragraphs, lists, code, block quotes, other directives. A callout inside a callout takes more colons on the outside, `::::warning` around `:::note`.
- **`?text` and `compile_text` read the title**, the default or the custom one, then the body.
- **A leaf or inline callout warns** (`not_container`), as there is nothing for it to hold.

From GitHub alerts, `@mdsvex/migrate` rewrites `> [!NOTE]` and the other four as these directives.

## Accessibility

- **`role="note"`, not `<aside>`.** An `aside` with a name is a complementary landmark, so a page with ten warnings would list ten landmarks. A note is a section of the content, which is what a callout is.
- **The title is a paragraph, not a heading.** A callout is no section of the page: it gets no id from `heading_ids`, no anchor and no place in a table of contents.
- **The kind is never colour alone.** The default title says it in words. With a custom title the icon carries it: each kind has its own shape (a circle, a bulb, a speech bubble, a triangle, an octagon), and the icon is then an image named after the kind, so a screen reader reads "Warning, Breaking change". With the default title the icon is hidden from screen readers, which would otherwise read the kind twice.
- **The colours have a contrast of at least 3.5:1** on white and on a dark page, for the icon and the border. The text keeps the colour of the page. In forced colours mode the callout gets a border.

## Options

```js
callouts({
	titles: { note: 'Remarque', warning: 'Attention' },
	css: false,
});
```

- **`titles`**: the default title of each kind, for a site in another language. A kind left out keeps its English title. The title is also what the icon is named with a custom title, so translate all five.
- **`css: false`**: leaves the stylesheet out. The markup and class names stay the same: `.callout`, `[data-kind]`, `.callout-title`, `.callout-icon`, `.callout-title-text` and `.callout-body`.

## Styling

The stylesheet sits in `:where()`, so any rule of your own wins. Each kind sets `--callout-color`, and `--callout-radius` rounds the corners:

```css
.callout[data-kind='tip'] {
	--callout-color: teal;
}
```

## Your own component

A `note`, `tip`, `important`, `warning` or `caution` exported from a [directives module](https://mdsvex.pngwn.io/docs#declaring-directives) replaces the plugin's component for that kind. It gets the props `kind` and `title` (the default title) and the snippets `label` (a custom title) and `children`. The plugin's component is exported as `@mdsvex/plugin-callouts/Callout.svelte`, to wrap it in your own.
