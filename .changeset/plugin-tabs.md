---
'@mdsvex/plugin-tabs': minor
---

New package: tabs and code groups. Each heading written directly inside a `:::tabs` container starts a tab, with the text of the heading as its label and what follows as its panel.

```js
import { tabs } from '@mdsvex/plugin-tabs';

mdsvex({ plugins: [tabs()] });
```

````svx
:::tabs

## macOS

Install it with Homebrew.

## Windows

Run the installer.

:::
````

A container that starts with a code fence is a code group. Each fence is a tab, labelled by its `[name]`, its `title` or its language:

````svx
:::tabs(group=pm)

```sh [npm]
npm install mdsvex
```

```sh [pnpm]
pnpm add mdsvex
```

:::
````

- `(group=name)` makes tab sets switch together and remembers the choice. The server always renders the first tab, and the stored choice is applied after hydration.
- The package ships `Tabs.svelte` and `Tab.svelte` as Svelte source. They follow the WAI-ARIA tabs pattern, with arrow keys, Home and End, and need Svelte 5.20 or later.
- With scripting off, the stylesheet shows every panel under its label. `tabs({ css: false })` leaves the stylesheet out.
- A `tabs` or `tab` export from your own directives module replaces the component and gets the same props.
- The build warns about a container with no tabs, a tab with no label and content before the first tab.
