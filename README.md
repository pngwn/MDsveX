# MDsveX

_do ya think I'm svexy?_

A markdown preprocessor for Svelte components. Basically [MDX](https://github.com/mdx-js/mdx) for Svelte.

This preprocessor allows you use Svelte components in your markdown, or markdown in your svelte components.

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
  - [Running actual code](#executing-yavaScript)
  - [YAML variables](#break-out-your-try-square)
  - [Escaped curlywurlies](#curlywurly-be-gone)
  - [Markdown-it plugins](#markdown-plugins)
- [What sucks?](#what-cant-i-do)

## Install it

You can probably leave it as a dev dependency.

```bash
npm i mdsvex # or yarn add mdsvex
```

### Use it

Add it as a preprocessor to you rollup or webpack config:

```js
{
  ...boringConfigStuff,
  plugins: [
    svelte({
      // whatever file extension you want to use has to go here as well
      extensions: ['svelte', '.svexy', '.svx'], // here actually
      preprocess: mdsvex({
        extension: '.svx', // the default is '.svexy', if you lack taste, you might want to change it
        parser: md => md.use(SomePlugin) // you can add markdown-it plugins if the feeling takes you
        // you can add markdown-it options here, html is always true
        markdownOptions: {
          typographer: true,
          linkify: true,
          highlight: (str, lang) => whatever(str, lang)
        },
      }),
    }
  ]
}
```

## Please, more.

### Executing YavaScript

You can 'execute' javascript by defining a `js exec` fenced code block, these components and variables will then be available within the MDsveX file:

````jsx
```js exec
import Counter from './path/to/Counter.svelte';

let number = 500;
```

<Counter count="{number}" />

Inline components <Counter count="{5}" /> are absolute fine too.
````

Use `js exec` blocks instead of script blocks because you can have as many `js exec` blocks ayou want. And I can't remember if I tested script blocks.

### Break out your try-square

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

### Curlywurly be gone!

Curlywurlies (`{` and `}`) are pretty special in Svelte components but this might be annoying when you're writing code snippets in fenced code blocks, so MDSveX escapes them cos it's nice like that:

The below is perfectly safe: the curlywurlies, which would normally cause some kind of difficulty, are escaped and should not bother you.

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

#### Markdown plugins

You can add your own `markdown-it` plugins if you are feeling adventurous. You do it in your rollup or webpack config and you do it like this:

```js
plugins: [
    svelte({
      extensions: ['svelte', '.svexy', '.svx'], // here actually
      preprocess: mdsvex({
        parser: md => md.use(myMagicalPlugin)
        // this is the actual instance of markdown-it that will be used to parse things
        // my fancy stuff gets added afterwards and it could break one of your plugins
        // if it does, i'm sorry
        // i didn't mean for it to be this way
        // i never intended to cause you distress
        // i will try to be better
      }),
    }
  ]
```

## What can't I do?

You can't use Svelte block syntax `{# ... }` at least not yet anyway. Maybe never.
