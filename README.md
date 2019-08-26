# MDsveX

_do ya think I'm svexy?_

A markdown preprocessor for Svelte components. Basically [MDX](https://github.com/mdx-js/mdx) for Svelte.

This preprocessor allows you use Svelte components in your markdown, or markdown in your svelte components.

[Try it](https://mdsvex.pngwn.io/)

You can do this:

````jsx

```js exec
import { Chart } from '../components/Chart.svelte';
```

# Here’s a chart

The chart is rendered inside our MDsveX document.

<Chart />

````

It uses [markdown-it](https://github.com/markdown-it/markdown-it) to parse the markdown, mainly due to the availability of plugins (which you can easily add). If this decision upsets you then I'm sorry.

---

- [Install](#install-it)
- [Config](#use-it)
- [More Info](#please-more)
  - [Running actual code](#executing-code)
  - [YAML variables](#fron-matter)
  - [Escaped curlywurlies](#escaped-curlywurlies)
  - [Markdown-it plugins](#markdown-it-plugins)
  - [Custom Layouts](#custom-layouts)
- [What sucks?](#what-cant-i-do)

## Install it

You can probably leave it as a dev dependency.

```bash
npm i mdsvex # or yarn add mdsvex
```

### Use it

Add it as a preprocessor to you rollup or webpack config, the mdsvex preprocessor function is a named import from the `mdsvex` module:

```js
import { mdsvex } from 'mdsvex';

export default {
  ...boringConfigStuff,
  plugins: [
    svelte({
      // whatever file extension you want to use has to go here as well
      extensions: ['.svelte', '.svexy', '.svx'], // here actually
      preprocess: mdsvex({
        extension: '.svx', // the default is '.svexy', if you lack taste, you might want to change it
        layout: path.join(__dirname, './DefaultLayout.svelte'), // this needs to be an absolute path
        parser: md => md.use(SomePlugin) // you can add markdown-it plugins if the feeling takes you
        // you can add markdown-it options here, html is always true
        markdownOptions: {
          typographer: true,
          linkify: true,
          highlight: (str, lang) => whatever(str, lang) // this should be a real function if you want to highlight
        },
      }),
    })
  ]
}
```

## Please, more.

### Executing Code

You can 'execute' javascript by defining a `js exec` fenced code block, these components and variables will then be available within the MDsveX file:

````jsx
```js exec
import Counter from './path/to/Counter.svelte';

let number = 500;
```

<Counter count="{number}" />

Inline components <Counter count="{5}" /> are absolute fine too.
````

Use `js exec` blocks instead of script blocks because you can have as many `js exec` blocks as you want. And I can't remember if I tested script blocks.

You can also create [module scripts](https://svelte.dev/docs#script_context_module), if you so desire, by using `js module`:

````jsx
```js module
  export function someFunction(value) {
    // some stuff here
  }
```

<Counter />

````

### Front-Matter

You can add some YAML front-matter if you like. The variables and values defined in YAML front-matter are injected into the component's script tag and are available in the MDsveX file. They are in an object named `_fm` (this might change at some point):

````jsx
---
number: 500
---

```js exec
import Counter from './path/to/Counter.svelte';

```

<Counter count="{_fm.number}" />
````

### Escaped Curlywurlies

Curlywurlies (`{` and `}`) are pretty special in Svelte components but this might be annoying when you're writing code snippets in fenced code blocks, so MDSveX escapes any curlywurlies non-executable in fenced code blocks:

The below is perfectly safe: the curlywurlies, which would normally cause issues, are escaped and should not bother you.

````jsx
```js
function myFunction(n) {
  return n * 2;
}
```

I am a sentence with an inline `{ code, snippet}` and i do not break either.
````

MDsveX does not escape curlywurlies outside of fenced code blocks nor does it escape curlywurlies in `js exec` blocks, so you can use dynamic values in component props and directly in markdown. This works:

````jsx
---
title: "The title for my great post"
---


```js exec
import Counter from './path/to/Counter.svelte';

let number = 500;
let text = { text: "Some random text." }
```

# { _fm.title }

<Counter count="{number}" />

{ text.text }
````

### markdown-it plugins

You can add your own `markdown-it` plugins if you are feeling adventurous. You do it in your rollup or webpack config and you do it like this:

```js
plugins: [
    svelte({
      extensions: ['svelte', '.svexy', '.svx'], // here actually
      preprocess: mdsvex({
        parser: md => md.use(myMagicalPlugin)
        // this is the actual instance of markdown-it that will be used to parse things
        // mdsvex adds it's mofifications after yours
        // this could potentially break things
      }),
    }
  ]
```

### Custom layouts

You can add custom layouts to any individual MDsveX file or define a global default. You can optionally add a global Layout by adding an option to MDsveX. This needs to be an absolute path to a Svelte component with a `slot` element (so we can slot the actual MDsveX file in). Use `path.join(__dirname, './path/to/file.svelte')` or similar to avoid tragedy:

```js
import { mdsvex } from 'mdsvex';
import path from 'path';

export default {
  ...boringConfigStuff,
  plugins: [
    svelte({
      preprocess: mdsvex({
        layout: path.join(__dirname, './DefaultLayout.svelte'),
      }),
    }
  ]
}
```

You can also add a layout to an individual MDsveX file by declaring it in YAML front-matter under the `layout` property. When defined in front-matter, paths are relative to the location of that file:

```yaml
---
layout: ./path/to/file.svelte
---
# Your markdown goes here
```

Layouts defined in front-matter always take priority over global layouts, if they are defined. If there is no global layout then the local layout will still be used.

Layout components will receive all front-matter properties as props, so you can use things like titles, dates or cover images in your layout component and do snazzy stuff, without the headache of doing it manually. All front-matter values will be passed down, simply `export let` those values in your layout to make use of them. If you try to use a value in a layout that isn't defined in front-matter then Svelte will complain and your page will be plagued with `undefined` and broken-ness (unless you set defaults in the layout).

These are all just Svelte components at the end of the day, so refer to the Svelte [tutorial](https://svelte.dev/tutorial) and [documentation](https://svelte.dev/docs) if you are unsure how it all works. A Sapper/MDsveX template is also in the works (and by 'in the works' I mean that I haven't started it yet).

## What can't I do?

You can't use Svelte block syntax `{# ... }` at least not yet anyway. Maybe never.
