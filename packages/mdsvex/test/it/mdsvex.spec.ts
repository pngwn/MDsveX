import { test, expect } from 'vitest';
import { Node, Parent } from 'unist';

import { join } from 'path';
import { lines } from '../utils';
import { to_posix } from '../../src/utils';

import { mdsvex, compile } from '../../src';
import containers from 'remark-containers';
import headings from 'remark-autolink-headings';
import slug from 'remark-slug';
import toc from 'rehype-toc';
import rehype_slug from 'rehype-slug';
import toml from 'toml';
import VMessage, { VFileMessage } from 'vfile-message';
import { Transformer } from 'unified';

const fix_dir = join(__dirname, '..', '_fixtures');

test('it should work', async () => {
	const output = await mdsvex().markup({
		content: `# hello`,
		filename: 'file.svx',
	});

	expect(lines(output?.code)).toEqual(lines(`<h1>hello</h1>`));
});

test('it should accept a remark plugin', async () => {
	const output = await mdsvex({ remarkPlugins: [containers] }).markup({
		content: `
::: div thingy

Hello friends, how are we today

<Counter />

:::
      `,
		filename: 'file.svx',
	});

	expect(lines(output?.code)).toEqual(
		lines(
			`<div class="thingy"><p>Hello friends, how are we today</p><Counter /></div>`
		)
	);
});

test('it should accept remark plugins - plural', async () => {
	const output = await mdsvex({
		remarkPlugins: [containers, slug, headings],
	}).markup({
		content: `# Lorem ipsum 😪

::: div thingy

Hello friends, how are we today

<Counter />

:::
    `,
		filename: 'file.svx',
	});

	// expect(lines(output?.code)).toEqual(
	// 	lines(`<h1 id="lorem-ipsum-"><a href="#lorem-ipsum-" aria-hidden="true" tabindex="-1"><span class="icon icon-link"></span></a>Lorem ipsum 😪</h1>
	// 	<div class="thingy"><p>Hello friends, how are we today</p><Counter /></div>`),
	//
	// );

	expect(lines(output?.code)).toEqual(
		lines(`<h1 id="lorem-ipsum-"><a href="#lorem-ipsum-" aria-hidden="true" tabindex="-1"><span class="icon icon-link"></span></a>Lorem ipsum 😪</h1>
<div class="thingy"><p>Hello friends, how are we today</p><Counter /></div>`)
	);
});

test('it should accept remark plugins with options - plural', async () => {
	const output = await mdsvex({
		remarkPlugins: [containers, slug, [headings, { behavior: 'append' }]],
	}).markup({
		content: `# Lorem ipsum 😪

::: div thingy

Hello friends, how are we today

<Counter />

:::
    `,
		filename: 'file.svx',
	});

	expect(lines(output?.code)).toEqual(
		lines(`<h1 id="lorem-ipsum-">Lorem ipsum 😪<a href="#lorem-ipsum-" aria-hidden="true" tabindex="-1"><span class="icon icon-link"></span></a></h1>
<div class="thingy"><p>Hello friends, how are we today</p><Counter /></div>`)
	);
});

test('it should accept a rehype plugin', async () => {
	const output = await mdsvex({
		rehypePlugins: [toc],
	}).markup({
		content: `# One

## Two

### Three`,
		filename: 'file.svx',
	});

	expect(lines(output?.code)).toEqual(
		lines(`<nav class="toc"><ol class="toc-level toc-level-1"><li class="toc-item toc-item-h1"><a class="toc-link toc-link-h1" href="#">One</a><ol
  class="toc-level toc-level-2"
><li class="toc-item toc-item-h2"><a class="toc-link toc-link-h2" href="#">Two</a><ol
  class="toc-level toc-level-3"
><li class="toc-item toc-item-h3"><a class="toc-link toc-link-h3" href="#">Three</a></li></ol></li></ol></li></ol></nav>
<h1>One</h1>
<h2>Two</h2>
<h3>Three</h3>`)
	);
});

test('it should accept rehype plugins - plural', async () => {
	const output = await mdsvex({
		rehypePlugins: [rehype_slug, toc],
	}).markup({
		content: `# One

## Two

### Three`,
		filename: 'file.svx',
	});

	expect(lines(output?.code)).toEqual(
		lines(`<nav class="toc"><ol class="toc-level toc-level-1"><li class="toc-item toc-item-h1"><a class="toc-link toc-link-h1" href="#one">One</a><ol
  class="toc-level toc-level-2"
><li class="toc-item toc-item-h2"><a class="toc-link toc-link-h2" href="#two">Two</a><ol
  class="toc-level toc-level-3"
><li class="toc-item toc-item-h3"><a class="toc-link toc-link-h3" href="#three">Three</a></li></ol></li></ol></li></ol></nav>
<h1 id="one">One</h1>
<h2 id="two">Two</h2>
<h3 id="three">Three</h3>`)
	);
});

test('it should accept rehype plugins with options - plural', async () => {
	const output = await mdsvex({
		rehypePlugins: [rehype_slug, [toc, { nav: false }]],
	}).markup({
		content: `# One

## Two

### Three`,
		filename: 'file.svx',
	});

	expect(lines(output?.code)).toEqual(
		lines(`<ol class="toc toc-level toc-level-1"><li class="toc-item toc-item-h1"><a class="toc-link toc-link-h1" href="#one">One</a><ol
  class="toc-level toc-level-2"
><li class="toc-item toc-item-h2"><a class="toc-link toc-link-h2" href="#two">Two</a><ol
  class="toc-level toc-level-3"
><li class="toc-item toc-item-h3"><a class="toc-link toc-link-h3" href="#three">Three</a></li></ol></li></ol></li></ol>
<h1 id="one">One</h1>
<h2 id="two">Two</h2>
<h3 id="three">Three</h3>`)
	);
});

test('it should accept remark plugins that modify code blocks', async () => {
	function code_plugin(): Transformer {
		return function (tree: Node): void {
			(tree as Parent).children.forEach((node) => {
				if (node.type === 'code') {
					node.type = 'html';
					node.value = `<p>The Code is: <pre>${node.value}</pre></p>`;
				}
			});
		};
	}

	const output = await mdsvex({
		remarkPlugins: [code_plugin],
	}).markup({
		content: `
\`\`\`booboo
hello friends
\`\`\`
`,
		filename: 'file.svx',
	});

	expect(lines(output?.code)).toEqual(
		lines(`<p>The Code is: <pre>hello friends</pre></p>`)
	);
});

test('it should respect the smartypants option', async () => {
	const output = await mdsvex({
		smartypants: true,
	}).markup({
		content: `"Hello friends!" 'This is some stuff...'`,
		filename: 'file.svx',
	});

	expect(lines(output?.code)).toEqual(
		lines(`<p>“Hello friends!” ‘This is some stuff…’</p>`)
	);
});

test('it should accept a smartypants options object', async () => {
	const output = await mdsvex({
		smartypants: { dashes: 'oldschool', ellipses: false },
	}).markup({
		content: `hello---friend...`,
		filename: 'file.svx',
	});

	expect(lines(output?.code)).toEqual(lines(`<p>hello—friend...</p>`));
});

test('only expected file extension names should work', async () => {
	const output = await mdsvex().markup({
		content: `# hello`,
		filename: 'file.boo',
	});

	expect(output?.code).toEqual(undefined);
});

test('the extension name should be customisable', async () => {
	const output = await mdsvex({ extensions: ['.jesus'] }).markup({
		content: `# hello`,
		filename: 'file.jesus',
	});

	expect(lines(output?.code)).toEqual(lines(`<h1>hello</h1>`));
});

test('custom layouts should work - special tags', async () => {
	const output = await mdsvex({
		layout: join(fix_dir, 'Layout.svelte'),
	}).markup({
		content: `
<svelte:head>
  <meta property="og:title" content={title} />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="{host}{path}" />
</svelte:head>

# hello`,
		filename: 'file.svx',
	});

	expect(lines(output?.code)).toEqual(
		lines(`
<script>
	import Layout_MDSVEX_DEFAULT from '${to_posix(join(fix_dir, 'Layout.svelte'))}';
</script>

<svelte:head>
  <meta property="og:title" content={title} />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="{host}{path}" />
</svelte:head>
<Layout_MDSVEX_DEFAULT {...$$props}>

<h1>hello</h1>
</Layout_MDSVEX_DEFAULT>`)
	);
});

test('custom layouts should work', async () => {
	const output = await mdsvex({
		layout: join(fix_dir, 'Layout.svelte'),
	}).markup({
		content: `# hello`,
		filename: 'file.svx',
	});

	expect(lines(output?.code)).toEqual(
		lines(`
<script>
	import Layout_MDSVEX_DEFAULT from '${to_posix(join(fix_dir, 'Layout.svelte'))}';
</script>

<Layout_MDSVEX_DEFAULT {...$$props}>
<h1>hello</h1>
</Layout_MDSVEX_DEFAULT>`)
	);
});

test('custom layouts should work - when there are script tags', async () => {
	const output = await mdsvex({
		layout: join(fix_dir, 'Layout.svelte'),
	}).markup({
		content: `
<script>
  export let x = 1;
</script>

# hello

<style>
  h1 {
    color: pink;
  }
</style>
`,
		filename: 'file.svx',
	});

	expect(lines(output?.code)).toEqual(
		lines(`<script>
	import Layout_MDSVEX_DEFAULT from '${to_posix(join(fix_dir, 'Layout.svelte'))}';
  export let x = 1;
</script>
<style>
  h1 {
    color: pink;
  }
</style>
<Layout_MDSVEX_DEFAULT {...$$props}>

<h1>hello</h1>

</Layout_MDSVEX_DEFAULT>`)
	);
});

test('custom layouts should work - when there are script tags with random attributes', async () => {
	const output = await mdsvex({
		layout: join(fix_dir, 'Layout.svelte'),
	}).markup({
		content: `
<script type="ts" lang=whatever thing="whatsit" doodaa=thingamabob>
  export let x = 1;
</script>

# hello

<style>
  h1 {
    color: pink;
  }
</style>
`,
		filename: 'file.svx',
	});

	expect(lines(output?.code)).toEqual(
		lines(`<script type="ts" lang=whatever thing="whatsit" doodaa=thingamabob>
	import Layout_MDSVEX_DEFAULT from '${to_posix(join(fix_dir, 'Layout.svelte'))}';
  export let x = 1;
</script>
<style>
  h1 {
    color: pink;
  }
</style>
<Layout_MDSVEX_DEFAULT {...$$props}>

<h1>hello</h1>

</Layout_MDSVEX_DEFAULT>`)
	);
});

test('custom layouts should work - when everything is in a random order', async () => {
	const output = await mdsvex({
		layout: join(fix_dir, 'Layout.svelte'),
	}).markup({
		content: `
# hello

<script>
  export let x = 1;
</script>

hello friends

<svelte:window />

<style>
  h1 {
    color: pink;
  }
</style>

boo boo boo
`,
		filename: 'file.svx',
	});

	expect(lines(output?.code)).toEqual(
		lines(`<script>
	import Layout_MDSVEX_DEFAULT from '${to_posix(join(fix_dir, 'Layout.svelte'))}';
  export let x = 1;
</script>
<style>
  h1 {
    color: pink;
  }
</style>
<svelte:window />
<Layout_MDSVEX_DEFAULT {...$$props}>
<h1>hello</h1>
<p>hello friends</p>
<p>boo boo boo</p>
</Layout_MDSVEX_DEFAULT>`)
	);
});

test('YAML front-matter should be injected into the component module script', async () => {
	const output = await mdsvex().markup({
		content: `---
string: value
string2: 'value2'
array: [1, 2, 3]
number: 999
---

# hello
`,
		filename: 'file.svx',
	});

	expect(lines(output?.code)).toEqual(
		lines(`<script context="module">
	export const metadata = {"string":"value","string2":"value2","array":[1,2,3],"number":999};
	const { string, string2, array, number } = metadata;
</script>

<h1>hello</h1>
`)
	);
});

test('YAML front-matter should be injected into the component module script - even if there is already a module script', async () => {
	const output = await mdsvex().markup({
		content: `---
string: value
string2: 'value2'
array: [1, 2, 3]
number: 999
---

<script context="module">
	let thing = 27;
</script>

# hello
`,
		filename: 'file.svx',
	});

	expect(lines(output?.code)).toEqual(
		lines(`<script context="module">
	export const metadata = {"string":"value","string2":"value2","array":[1,2,3],"number":999};
	const { string, string2, array, number } = metadata;
	let thing = 27;
</script>


<h1>hello</h1>
`)
	);
});

test('YAML front-matter should be injected into the component module script - even if there is already a module script with unquoted attributes', async () => {
	const output = await mdsvex().markup({
		content: `---
string: value
string2: 'value2'
array: [1, 2, 3]
number: 999
---

<script context=module>
	let thing = 27;
</script>

# hello
`,
		filename: 'file.svx',
	});

	expect(lines(output?.code)).toEqual(
		lines(`<script context=module>
	export const metadata = {"string":"value","string2":"value2","array":[1,2,3],"number":999};
	const { string, string2, array, number } = metadata;
	let thing = 27;
</script>


<h1>hello</h1>
`)
	);
});

test('YAML front-matter should be injected into the component module script - even if there is already a module script with random attributes', async () => {
	const output = await mdsvex().markup({
		content: `---
string: value
string2: 'value2'
array: [1, 2, 3]
number: 999
---

<script type="ts" lang=whatever context=module thing="whatsit" doodaa=thingamabob>
	let thing = 27;
</script>

# hello
`,
		filename: 'file.svx',
	});

	expect(lines(output?.code)).toEqual(
		lines(`<script type="ts" lang=whatever context=module thing="whatsit" doodaa=thingamabob>
	export const metadata = {"string":"value","string2":"value2","array":[1,2,3],"number":999};
	const { string, string2, array, number } = metadata;
	let thing = 27;
</script>


<h1>hello</h1>
`)
	);
});

test('YAML front-matter should be injected passed to custom layouts', async () => {
	const output = await mdsvex({
		layout: join(fix_dir, 'Layout.svelte'),
	}).markup({
		content: `---
string: value
string2: 'value2'
array: [1, 2, 3]
number: 999
---

<script context="module">
	let thing = 27;
</script>

# hello
`,
		filename: 'file.svx',
	});

	expect(lines(output?.code)).toEqual(
		lines(`<script context="module">
	export const metadata = {"string":"value","string2":"value2","array":[1,2,3],"number":999};
	const { string, string2, array, number } = metadata;
	let thing = 27;
</script>

<script>
	import Layout_MDSVEX_DEFAULT from '${to_posix(join(fix_dir, 'Layout.svelte'))}';
</script>

<Layout_MDSVEX_DEFAULT {...$$props} {...metadata}>

<h1>hello</h1>
</Layout_MDSVEX_DEFAULT>`)
	);
});

test('User can provide a frontmatter function for non-YAML frontmatter', async () => {
	const parse_toml = (v: string, m: VFileMessage[]) => {
		try {
			return toml.parse(v);
		} catch (e) {
			m.push(
				new VMessage(
					'Parsing error on line ' +
						e.line +
						', column ' +
						e.column +
						': ' +
						e.message
				)
			);
		}
	};
	const output = await mdsvex({
		layout: join(fix_dir, 'Layout.svelte'),
		frontmatter: {
			parse: parse_toml,
			type: 'toml',
			marker: '+',
		},
	}).markup({
		content: `+++
title = "TOML Example"

[owner]
name = "some name"
dob = 1879-05-27T07:32:00-08:00 # First class dates
+++

<script context="module">
	let thing = 27;
</script>

# hello
`,
		filename: 'file.svx',
	});

	expect(lines(output?.code)).toEqual(
		lines(`<script context="module">
	export const metadata = {"title":"TOML Example","owner":{"name":"some name","dob":"1879-05-27T15:32:00.000Z"}};
	const { title, owner } = metadata;
	let thing = 27;
</script>

<script>
	import Layout_MDSVEX_DEFAULT from '${to_posix(join(fix_dir, 'Layout.svelte'))}';
</script>

<Layout_MDSVEX_DEFAULT {...$$props} {...metadata}>

<h1>hello</h1>
</Layout_MDSVEX_DEFAULT>`)
	);
});

test('Custom layouts can be an object of named layouts, mapping to folders', async () => {
	const output = await mdsvex({
		layout: {
			one: join(fix_dir, 'Layout.svelte'),
			two: join(fix_dir, 'LayoutTwo.svelte'),
		},
	}).markup({
		content: `---
string: value
string2: 'value2'
array: [1, 2, 3]
number: 999
---

<script context="module">
	let thing = 27;
</script>

	# hello
	`,
		filename: 'blah/two/file.svx',
	});

	expect(lines(output?.code)).toEqual(
		lines(`<script context="module">
	export const metadata = {"string":"value","string2":"value2","array":[1,2,3],"number":999};
	const { string, string2, array, number } = metadata;
	let thing = 27;
</script>

<script>
	import Layout_MDSVEX_DEFAULT from '${to_posix(
		join(fix_dir, 'LayoutTwo.svelte')
	)}';
</script>

<Layout_MDSVEX_DEFAULT {...$$props} {...metadata}>

<h1>hello</h1>
</Layout_MDSVEX_DEFAULT>`)
	);
});

test('Ensure no-one tries to pass a "layouts" option', async () => {
	expect(
		async () =>
			await mdsvex({
				//@ts-ignore
				layouts: {
					one: join(fix_dir, 'Layout.svelte'),
					two: join(fix_dir, 'LayoutTwo.svelte'),
				},
			}).markup({
				content: `---
string: value
string2: 'value2'
array: [1, 2, 3]
number: 999
---

<script context="module">
	let thing = 27;
</script>

	# hello
	`,
				filename: 'blah/two/file.svx',
			})
	).rejects.toThrowError(
		`mdsvex: "layouts" is not a valid option. Did you mean "layout"?`
	);
});

test('Warn on receiving unknown options', async () => {
	const output_fn = async () =>
		await mdsvex({
			//@ts-ignore
			bip: 'hi',
			bop: 'ho',
			boom: 'oh',
			layout: {
				one: join(fix_dir, 'Layout.svelte'),
				two: join(fix_dir, 'LayoutTwo.svelte'),
			},
		}).markup({
			content: `---
string: value
string2: 'value2'
array: [1, 2, 3]
number: 999
---

<script context="module">
	let thing = 27;
</script>

	# hello
	`,
			filename: 'blah/two/file.svx',
		});

	// don't even ask
	const console_warn = console.warn;
	let warning = '';
	console.warn = (args: string) => (warning = args);

	await output_fn();

	expect(warning).toEqual(
		'mdsvex: Received unknown options: bip, bop, boom. Valid options are: filename, remarkPlugins, rehypePlugins, smartypants, extension, extensions, layout, highlight, frontmatter.'
	);

	console.warn = console_warn;
});

test('Custom layout can be set via frontmatter - strange formatting', async () => {
	const output = await mdsvex({
		layout: {
			one: join(fix_dir, 'Layout.svelte'),
			two: join(fix_dir, 'LayoutTwo.svelte'),
		},
	}).markup({
		content: `---
layout: one
string: value
string2: 'value2'
array: [1, 2, 3]
number: 999
---

<script context="module">
	let thing = 27;

</script>

# hello
	`,
		filename: 'blah/two/file.svx',
	});

	expect(lines(output?.code)).toEqual(
		lines(`<script context="module">
	export const metadata = {"layout":"one","string":"value","string2":"value2","array":[1,2,3],"number":999};
	const { layout, string, string2, array, number } = metadata;
	let thing = 27;

</script>

<script>
	import Layout_MDSVEX_DEFAULT from '${to_posix(join(fix_dir, 'Layout.svelte'))}';
</script>

<Layout_MDSVEX_DEFAULT {...$$props} {...metadata}>

<h1>hello</h1>
</Layout_MDSVEX_DEFAULT>`)
	);
});

test('layout: false in front matter should remove any layouts', async () => {
	const output = await mdsvex({
		layout: join(fix_dir, 'Layout.svelte'),
	}).markup({
		content: `---
layout: false
---

<script context="module">
	let thing = 27;
</script>

# hello
`,
		filename: 'file.svx',
	});

	expect(lines(output?.code)).toEqual(
		lines(`<script context="module">
	export const metadata = {"layout":false};
	const { layout } = metadata;
	let thing = 27;
</script>


<h1>hello</h1>
`)
	);
});

test('Fallback layouts should work', async () => {
	const output = await mdsvex({
		layout: {
			one: join(fix_dir, 'Layout.svelte'),
			two: join(fix_dir, 'LayoutTwo.svelte'),
			_: join(fix_dir, 'LayoutThree.svelte'),
		},
	}).markup({
		content: `---
string: value
string2: 'value2'
array: [1, 2, 3]
number: 999
---

<script context="module">
	let thing = 27;
</script>

	# hello
	`,
		filename: 'blah/three/file.svx',
	});

	expect(lines(output?.code)).toEqual(
		lines(`<script context="module">
	export const metadata = {"string":"value","string2":"value2","array":[1,2,3],"number":999};
	const { string, string2, array, number } = metadata;
	let thing = 27;
</script>

<script>
	import Layout_MDSVEX_DEFAULT from '${to_posix(
		join(fix_dir, 'LayoutThree.svelte')
	)}';
</script>

<Layout_MDSVEX_DEFAULT {...$$props} {...metadata}>

<h1>hello</h1>
</Layout_MDSVEX_DEFAULT>`)
	);
});

test('layout: allow custom components', async () => {
	const output = await mdsvex({
		layout: join(fix_dir, 'LayoutWithComponents.svelte'),
	}).markup({
		content: `

<script context="module">
	let thing = 27;
</script>

# hello
`,
		filename: 'file.svx',
	});

	expect(lines(output?.code)).toEqual(
		lines(`<script context="module">
	let thing = 27;
</script>

<script>
	import Layout_MDSVEX_DEFAULT, * as Components from '${to_posix(
		join(fix_dir, 'LayoutWithComponents.svelte')
	)}';
</script>

<Layout_MDSVEX_DEFAULT {...$$props}>

<Components.h1>hello</Components.h1>
</Layout_MDSVEX_DEFAULT>`)
	);
});

test('layout: allow custom components', async () => {
	const output = await mdsvex({
		layout: join(
			__dirname,
			'..',
			'_fixtures',
			'LayoutThreeWithComponents.svelte'
		),
	}).markup({
		content: `

<script context="module">
	let thing = 27;
</script>

# hello

## hello

### hello

#### hello

hello *hello* **hello**
`,
		filename: 'file.svx',
	});

	expect(lines(output?.code)).toEqual(
		lines(`<script context="module">
	let thing = 27;
</script>

<script>
	import Layout_MDSVEX_DEFAULT, * as Components from '${to_posix(
		join(fix_dir, 'LayoutThreeWithComponents.svelte')
	)}';
</script>

<Layout_MDSVEX_DEFAULT {...$$props}>

<Components.h1>hello</Components.h1>
<Components.h2>hello</Components.h2>
<Components.h3>hello</Components.h3>
<Components.h4>hello</Components.h4>
<Components.p>hello <Components.em>hello</Components.em> <Components.strong>hello</Components.strong></Components.p>
</Layout_MDSVEX_DEFAULT>`)
	);
});

test('layout: allow custom components', async () => {
	const output = await mdsvex({
		layout: join(
			__dirname,
			'..',
			'_fixtures',
			'LayoutTwoWithComponents.svelte'
		),
	}).markup({
		content: `

<script context="module">
	let thing = 27;
</script>

# hello

I am some paragraph text
`,
		filename: 'file.svx',
	});

	expect(lines(output?.code)).toEqual(
		lines(`<script context="module">
	let thing = 27;
</script>

<script>
	import Layout_MDSVEX_DEFAULT, * as Components from '${to_posix(
		join(fix_dir, 'LayoutTwoWithComponents.svelte')
	)}';
</script>

<Layout_MDSVEX_DEFAULT {...$$props}>

<Components.h1>hello</Components.h1>
<Components.p>I am some paragraph text</Components.p>
</Layout_MDSVEX_DEFAULT>`)
	);
});

test('layout: allow custom components', async () => {
	const output = await mdsvex({
		layout: join(
			__dirname,
			'..',
			'_fixtures',
			'LayoutTwoWithComponents.svelte'
		),
	}).markup({
		content: `

<script context="module">
	let thing = 27;
</script>

# hello

I am some paragraph text
`,
		filename: 'file.svx',
	});

	expect(lines(output?.code)).toEqual(
		lines(`<script context="module">
	let thing = 27;
</script>

<script>
	import Layout_MDSVEX_DEFAULT, * as Components from '${to_posix(
		join(fix_dir, 'LayoutTwoWithComponents.svelte')
	)}';
</script>

<Layout_MDSVEX_DEFAULT {...$$props}>

<Components.h1>hello</Components.h1>
<Components.p>I am some paragraph text</Components.p>
</Layout_MDSVEX_DEFAULT>`)
	);
});

test('compile, no options', async () => {
	const output = await compile('# Hello world');
	expect(output).toEqual({
		code: '\n<h1>Hello world</h1>\n',
		data: {},
		map: '',
	});
});

test('compile, gets headmatter attributes', async () => {
	const output = await compile(
		`
---
title: Yo
---

# Hello world
`
	);

	expect(output).toEqual({
		code:
			'<script context="module">\n\texport const metadata = {"title":"Yo"};\n\tconst { title } = metadata;\n</script>\n\n<h1>Hello world</h1>\n',
		data: {
			fm: {
				title: 'Yo',
			},
		},
		map: '',
	});
});

test('layout: allow custom components', async () => {
	const output = await compile(
		`
<script context="module">
	let thing = 27;
</script>

# hello

I am some paragraph text
`,
		{
			layout: join(
				__dirname,
				'..',
				'_fixtures',
				'LayoutTwoWithComponents.svelte'
			),
		}
	);

	expect(lines(output?.code)).toEqual(
		lines(`<script context="module">
	let thing = 27;
</script>

<script>
	import Layout_MDSVEX_DEFAULT, * as Components from '${to_posix(
		join(fix_dir, 'LayoutTwoWithComponents.svelte')
	)}';
</script>

<Layout_MDSVEX_DEFAULT {...$$props}>

<Components.h1>hello</Components.h1>
<Components.p>I am some paragraph text</Components.p>
</Layout_MDSVEX_DEFAULT>`)
	);
});

test('layout: allow custom components', async () => {
	const output = await compile(
		`
<script context="module">
	let thing = 27;
</script>

# hello

I am some paragraph text
`,
		{
			layout: join(
				__dirname,
				'..',
				'_fixtures',
				'LayoutTwoWithComponents.svelte'
			),
			extensions: ['.spooky'],
		}
	);

	expect(lines(output?.code)).toEqual(
		lines(`<script context="module">
	let thing = 27;
</script>

<script>
	import Layout_MDSVEX_DEFAULT, * as Components from '${to_posix(
		join(fix_dir, 'LayoutTwoWithComponents.svelte')
	)}';
</script>

<Layout_MDSVEX_DEFAULT {...$$props}>

<Components.h1>hello</Components.h1>
<Components.p>I am some paragraph text</Components.p>
</Layout_MDSVEX_DEFAULT>`)
	);
});
