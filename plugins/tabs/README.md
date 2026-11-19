# @mdsvex/plugin-tabs

Tabs and code groups for [mdsvex](https://mdsvex.pngwn.io). Each heading inside a `:::tabs` container is a tab, and so is each code fence when the container holds only fences.

```bash
pnpm add --save-dev @mdsvex/plugin-tabs@next
```

```js
// vite.config.js
import { mdsvex } from 'mdsvex';
import { tabs } from '@mdsvex/plugin-tabs';

export default {
	plugins: [mdsvex({ plugins: [tabs()] })],
};
```

```md
:::tabs

## macOS

Install it with Homebrew.

## Windows

Run the installer.

:::
```

```html
<div class="tabs">
	<div class="tabs-list" role="tablist">
		<button class="tab" role="tab" aria-selected="true" ...>macOS</button>
		<button class="tab" role="tab" aria-selected="false" ...>Windows</button>
	</div>
	<div class="tab-panel" role="tabpanel" ...>
		<p>Install it with Homebrew.</p>
	</div>
	<div class="tab-panel" role="tabpanel" hidden ...>
		<p>Run the installer.</p>
	</div>
</div>
```

It needs Svelte 5.20 or later.

## Tabs

- **Each heading written directly inside the container starts a tab.** The text of the heading is the label, and what follows, up to the next such heading, is the panel.
- **The first heading sets the depth.** If it is a `##`, every `##` directly inside starts a tab. A heading of any other depth is content of the panel it is in.
- **Only headings written directly inside count.** A heading in a block quote, a list or another directive starts no tab.
- **A label is not a heading in the page.** It is rendered inside the tab button as plain inline content, with its emphasis, code and `{expressions}` kept. It gets no id from `heading_ids`, no anchor and no place in a table of contents, since a panel that may be hidden is not a section a reader can jump to.
- **`:::tabs[Pick your system]`** renders the bracket text in a `<p class="tabs-label">` above the tabs and names the tab list with it.

Tabs nest when the outer container uses more colons, and each container splits on its own depth:

```md
::::tabs

## npm

:::tabs

### macOS

### Windows

:::

## pnpm

::::
```

In a viewer that knows nothing of directives, such as GitHub, the source reads as what it is: a heading for each choice with its content under it.

## Code groups

When the first thing in the container is a code fence, each fence written directly inside is a tab:

````md
:::tabs

```sh [npm]
npm install mdsvex
```

```sh title="pnpm"
pnpm add mdsvex
```

```js
console.log('labelled js');
```

:::
````

- **The label is the name of the fence**, `[npm]` or `title="npm"`, whichever is written first, as [fence meta](https://mdsvex.pngwn.io/docs#fence-meta) reads them. A fence with neither is labelled by its language.
- **Anything after a fence is in its panel**, a heading too, up to the next fence.
- **The fence is rendered as it is anywhere else**, by the built in highlighter, by your own, or by a [replaced `pre`](https://mdsvex.pngwn.io/docs#code-block-components), which still gets `title` as a prop. The highlighter puts a title in a `<figcaption>` above the code. In a code group the tab already shows it, so the stylesheet hides that one.
- **The first heading or fence decides.** A container that starts with a heading is tabs, and a fence inside it is content. One that starts with a fence is a code group, and a heading inside it is content.

## Tabs that switch together

Give tab sets the same `group` and choosing a tab in one chooses the tab with the same label in the others, on this page and on the next one the reader opens:

```md
:::tabs(group=pm)

## npm

## pnpm

:::
```

- **Sets are matched by the text of the label**, so `## pnpm` in one set matches a fence named `[pnpm]` in another. A set with no tab of that label stays as it is.
- **The choice is kept in `localStorage`**, under `mdsvex-tabs:` and the name of the group.
- **The server never knows the choice.** It always renders the first tab open, and so does the first render in the browser. The stored choice is applied once the page has hydrated, so there is no hydration mismatch, and a reader with a stored choice may see the first tab for a moment.

## Keyboard and screen readers

The components follow the [WAI-ARIA tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/):

- the list is a `tablist`, each button a `tab` with `aria-selected` and `aria-controls`, and each panel a `tabpanel` named by its tab
- one tab is in the tab order, the selected one. <kbd>Left</kbd> and <kbd>Right</kbd> move to the tab before and after and wrap around, <kbd>Home</kbd> and <kbd>End</kbd> go to the first and the last. In right to left text the arrows swap.
- a tab is selected as soon as it has focus
- <kbd>Tab</kbd> moves from the tab list to the open panel, which can take focus

## Before hydration and without JavaScript

The server renders the tab list and every panel, with the first panel open and the others `hidden`.

- **Before the page hydrates** a reader sees the first panel, laid out as it will stay. The buttons do nothing yet.
- **With scripting turned off** the stylesheet hides the tab list and shows every panel, one after another, each under its label. A tab list that can't be pressed would hide every panel but the first, so the content comes first. This uses the `scripting` media query (Chrome 120, Firefox 113, Safari 17). In an older browser with scripting off, and with `css: false`, the reader gets the first panel only.

Each panel holds a copy of its label in `<div class="tab-panel-label" hidden>` for that view, which is why a label is rendered twice.

## What it warns about

The build reports these, with the line they are on, and still renders the page:

| code                       | when                                                               | what is rendered                                                                        |
| -------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `no_tabs`                  | a `:::tabs` with no heading and no fence directly inside           | the content, with an empty tab list                                                     |
| `tab_without_label`        | a heading with no text, or a fence with no name, title or language | the tab is labelled by its number                                                       |
| `content_before_first_tab` | anything written before the first heading or fence                 | it stays above the panels, in no tab. Move it above the container, or into its brackets |

## Styles

The components come with a small stylesheet. Every selector is inside `:where()`, so any rule of yours wins, and these custom properties are read from `.tabs`:

| property                | default                |
| ----------------------- | ---------------------- |
| `--tabs-gap`            | `0.25rem`              |
| `--tabs-padding`        | `0.5rem 0.75rem`       |
| `--tabs-line`           | the text colour at 20% |
| `--tabs-color`          | the text colour at 70% |
| `--tabs-selected-color` | `inherit`              |
| `--tabs-selected-line`  | the text colour        |

The classes are `tabs` (and `tabs-code` on a code group), `tabs-label`, `tabs-list`, `tab`, `tab-panel` and `tab-panel-label`. To leave the stylesheet out:

```js
tabs({ css: false });
```

The markup and class names stay the same. The stylesheet is also exported as `@mdsvex/plugin-tabs/tabs.css`, to copy from or to import where you choose.

The tab list is the children of the container rendered a second time, as buttons. The stylesheet hides anything in it that is not a tab, so without the stylesheet content written before the first tab shows twice.

## Your own components

Export a `tabs` or a `tab` from a [directives module](https://mdsvex.pngwn.io/docs#declaring-directives) and it replaces the plugin's component. The plugin still splits the container, so yours gets the same props:

| prop       | `tabs`                                               | `tab`                                                |
| ---------- | ---------------------------------------------------- | ---------------------------------------------------- |
| `label`    | the bracket text of the container, when there is any | the content of the heading, or the name of the fence |
| `children` | the tabs                                             | the panel                                            |
| `group`    | the `group` arg, when there is one                   |                                                      |
| `code`     | `"true"` for a code group                            |                                                      |
| `index`    |                                                      | the place of the tab, from `"0"`                     |

Every tab has a `label`. For a fence it holds the name of the fence as text, and for a tab with nothing to show it holds its number. The plugin's `tabs` renders its children twice, once for the buttons and once for the panels, and its `tab` reads from context which of the two it is. Replace both together, or wrap the plugin's own:

```js
import Tabs from '@mdsvex/plugin-tabs/Tabs.svelte';
import Tab from '@mdsvex/plugin-tabs/Tab.svelte';
```

## How it is packaged

The components are shipped as `.svelte` source and compiled by the Svelte in your app. Install the package in the app that runs Vite, so that vite-plugin-svelte finds it in that `package.json` and compiles it for the server too.

With `compile()` from `mdsvex`, the document imports `@mdsvex/plugin-tabs/directives` (or `/directives/unstyled`), and your bundler needs a Svelte plugin to resolve it.
