import { suite } from 'uvu';
import * as assert from 'uvu/assert';

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

const mdsvex_it = suite('mdsvex');

mdsvex_it('it should work', async () => {
	const output = await mdsvex().markup({
		content: `# hello`,
		filename: 'file.svx',
	});

	assert.equal(lines(output.code), lines(`<h1>hello</h1>`));
});

mdsvex_it('it should accept a remark plugin', async () => {
	const output = await mdsvex({ remarkPlugins: [containers] }).markup({
		content: `
::: div thingy

Hello friends, how are we today

<Counter />

:::
      `,
		filename: 'file.svx',
	});

	assert.equal(
		lines(
			`<div class="thingy"><p>Hello friends, how are we today</p><Counter /></div>`
		),
		lines(output.code)
	);
});

mdsvex_it('it should accept remark plugins - plural', async () => {
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

	assert.equal(
		lines(`<h1 id="lorem-ipsum-"><a href="#lorem-ipsum-" aria-hidden="true" tabindex="-1"><span class="icon icon-link"></span></a>Lorem ipsum 😪</h1>
		<div class="thingy"><p>Hello friends, how are we today</p><Counter /></div>`),
		lines(output.code)
	);
});

mdsvex_it('it should accept remark plugins with options - plural', async () => {
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

	assert.equal(
		lines(`<h1 id="lorem-ipsum-">Lorem ipsum 😪<a href="#lorem-ipsum-" aria-hidden="true" tabindex="-1"><span class="icon icon-link"></span></a></h1>
<div class="thingy"><p>Hello friends, how are we today</p><Counter /></div>`),
		lines(output.code)
	);
});

mdsvex_it('it should accept a rehype plugin', async () => {
	const output = await mdsvex({
		rehypePlugins: [toc],
	}).markup({
		content: `# One

## Two

### Three`,
		filename: 'file.svx',
	});

	assert.equal(
		lines(`<nav class="toc"><ol class="toc-level toc-level-1"><li class="toc-item toc-item-h1"><a class="toc-link toc-link-h1" href="#">One</a><ol
  class="toc-level toc-level-2"
><li class="toc-item toc-item-h2"><a class="toc-link toc-link-h2" href="#">Two</a><ol
  class="toc-level toc-level-3"
><li class="toc-item toc-item-h3"><a class="toc-link toc-link-h3" href="#">Three</a></li></ol></li></ol></li></ol></nav>
<h1>One</h1>
<h2>Two</h2>
<h3>Three</h3>`),
		lines(output.code)
	);
});

mdsvex_it('it should accept rehype plugins - plural', async () => {
	const output = await mdsvex({
		rehypePlugins: [rehype_slug, toc],
	}).markup({
		content: `# One

## Two

### Three`,
		filename: 'file.svx',
	});

	assert.equal(
		lines(`<nav class="toc"><ol class="toc-level toc-level-1"><li class="toc-item toc-item-h1"><a class="toc-link toc-link-h1" href="#one">One</a><ol
  class="toc-level toc-level-2"
><li class="toc-item toc-item-h2"><a class="toc-link toc-link-h2" href="#two">Two</a><ol
  class="toc-level toc-level-3"
><li class="toc-item toc-item-h3"><a class="toc-link toc-link-h3" href="#three">Three</a></li></ol></li></ol></li></ol></nav>
<h1 id="one">One</h1>
<h2 id="two">Two</h2>
<h3 id="three">Three</h3>`),
		lines(output.code)
	);
});

mdsvex_it('it should accept rehype plugins with options - plural', async () => {
	const output = await mdsvex({
		rehypePlugins: [rehype_slug, [toc, { nav: false }]],
	}).markup({
		content: `# One

## Two

### Three`,
		filename: 'file.svx',
	});

	assert.equal(
		lines(`<ol class="toc toc-level toc-level-1"><li class="toc-item toc-item-h1"><a class="toc-link toc-link-h1" href="#one">One</a><ol
  class="toc-level toc-level-2"
><li class="toc-item toc-item-h2"><a class="toc-link toc-link-h2" href="#two">Two</a><ol
  class="toc-level toc-level-3"
><li class="toc-item toc-item-h3"><a class="toc-link toc-link-h3" href="#three">Three</a></li></ol></li></ol></li></ol>
<h1 id="one">One</h1>
<h2 id="two">Two</h2>
<h3 id="three">Three</h3>`),
		lines(output.code)
	);
});

mdsvex_it('it should respect the smartypants option', async () => {
	const output = await mdsvex({
		smartypants: true,
	}).markup({
		content: `"Hello friends!" 'This is some stuff...'`,
		filename: 'file.svx',
	});

	assert.equal(
		lines(`<p>“Hello friends!” ‘This is some stuff…’</p>`),
		lines(output.code)
	);
});

mdsvex_it('it should accept a smartypants options object', async () => {
	const output = await mdsvex({
		smartypants: { dashes: 'oldschool', ellipses: false },
	}).markup({
		content: `hello---friend...`,
		filename: 'file.svx',
	});

	assert.equal(lines(`<p>hello—friend...</p>`), lines(output.code));
});

mdsvex_it('only expected file extension names should work', async () => {
	const output = await mdsvex().markup({
		content: `# hello`,
		filename: 'file.boo',
	});

	assert.equal(undefined, output);
});

mdsvex_it('the extension name should be customisable', async () => {
	const output = await mdsvex({ extension: '.jesus' }).markup({
		content: `# hello`,
		filename: 'file.jesus',
	});

	assert.equal(lines(`<h1>hello</h1>`), lines(output.code));
});

mdsvex_it('custom layouts should work - special tags', async () => {
	const output = await mdsvex({
		layout: join(__dirname, '..', '_fixtures', 'Layout.svelte'),
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

	assert.equal(
		lines(`
<script>
	import Layout_MDSVEX_DEFAULT from '${to_posix(
		join(__dirname, '..', '_fixtures', 'Layout.svelte')
	)}';
</script>

<svelte:head>
  <meta property="og:title" content={title} />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="{host}{path}" />
</svelte:head>
<Layout_MDSVEX_DEFAULT>

<h1>hello</h1>
</Layout_MDSVEX_DEFAULT>`),
		lines(output.code)
	);
});

mdsvex_it('custom layouts should work', async () => {
	const output = await mdsvex({
		layout: join(__dirname, '..', '_fixtures', 'Layout.svelte'),
	}).markup({
		content: `# hello`,
		filename: 'file.svx',
	});

	assert.equal(
		lines(`
<script>
	import Layout_MDSVEX_DEFAULT from '${to_posix(
		join(__dirname, '..', '_fixtures', 'Layout.svelte')
	)}';
</script>

<Layout_MDSVEX_DEFAULT>
<h1>hello</h1>
</Layout_MDSVEX_DEFAULT>`),
		lines(output.code)
	);
});

mdsvex_it(
	'custom layouts should work - when there are script tags',
	async () => {
		const output = await mdsvex({
			layout: join(__dirname, '..', '_fixtures', 'Layout.svelte'),
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

		assert.equal(
			lines(`<script>
	import Layout_MDSVEX_DEFAULT from '${to_posix(
		join(__dirname, '..', '_fixtures', 'Layout.svelte')
	)}';
  export let x = 1;
</script>
<style>
  h1 {
    color: pink;
  }
</style>
<Layout_MDSVEX_DEFAULT>

<h1>hello</h1>

</Layout_MDSVEX_DEFAULT>`),
			lines(output.code)
		);
	}
);

mdsvex_it(
	'custom layouts should work - when there are script tags with random attributes',
	async () => {
		const output = await mdsvex({
			layout: join(__dirname, '..', '_fixtures', 'Layout.svelte'),
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

		assert.equal(
			lines(`<script type="ts" lang=whatever thing="whatsit" doodaa=thingamabob>
	import Layout_MDSVEX_DEFAULT from '${to_posix(
		join(__dirname, '..', '_fixtures', 'Layout.svelte')
	)}';
  export let x = 1;
</script>
<style>
  h1 {
    color: pink;
  }
</style>
<Layout_MDSVEX_DEFAULT>

<h1>hello</h1>

</Layout_MDSVEX_DEFAULT>`),
			lines(output.code)
		);
	}
);

mdsvex_it(
	'custom layouts should work - when everything is in a random order',
	async () => {
		const output = await mdsvex({
			layout: join(__dirname, '..', '_fixtures', 'Layout.svelte'),
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

		assert.equal(
			lines(`<script>
	import Layout_MDSVEX_DEFAULT from '${to_posix(
		join(__dirname, '..', '_fixtures', 'Layout.svelte')
	)}';
  export let x = 1;
</script>
<style>
  h1 {
    color: pink;
  }
</style>
<svelte:window />
<Layout_MDSVEX_DEFAULT>
<h1>hello</h1>
<p>hello friends</p>
<p>boo boo boo</p>
</Layout_MDSVEX_DEFAULT>`),
			lines(output.code)
		);
	}
);

mdsvex_it(
	'YAML front-matter should be injected into the component module script',
	async () => {
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

		assert.equal(
			lines(`<script context="module">
	export const metadata = {"string":"value","string2":"value2","array":[1,2,3],"number":999};
	const { string, string2, array, number } = metadata;
</script>

<h1>hello</h1>
`),
			lines(output.code)
		);
	}
);

mdsvex_it(
	'YAML front-matter should be injected into the component module script - even if there is already a module script',
	async () => {
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

		assert.equal(
			lines(`<script context="module">
	export const metadata = {"string":"value","string2":"value2","array":[1,2,3],"number":999};
	const { string, string2, array, number } = metadata;
	let thing = 27;
</script>


<h1>hello</h1>
`),
			lines(output.code)
		);
	}
);

mdsvex_it(
	'YAML front-matter should be injected into the component module script - even if there is already a module script with unquoted attributes',
	async () => {
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

		assert.equal(
			lines(`<script context=module>
	export const metadata = {"string":"value","string2":"value2","array":[1,2,3],"number":999};
	const { string, string2, array, number } = metadata;
	let thing = 27;
</script>


<h1>hello</h1>
`),
			lines(output.code)
		);
	}
);

mdsvex_it(
	'YAML front-matter should be injected into the component module script - even if there is already a module script with random attributes',
	async () => {
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

		assert.equal(
			lines(`<script type="ts" lang=whatever context=module thing="whatsit" doodaa=thingamabob>
	export const metadata = {"string":"value","string2":"value2","array":[1,2,3],"number":999};
	const { string, string2, array, number } = metadata;
	let thing = 27;
</script>


<h1>hello</h1>
`),
			lines(output.code)
		);
	}
);

mdsvex_it(
	'YAML front-matter should be injected passed to custom layouts',
	async () => {
		const output = await mdsvex({
			layout: join(__dirname, '..', '_fixtures', 'Layout.svelte'),
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

		assert.equal(
			lines(`<script context="module">
	export const metadata = {"string":"value","string2":"value2","array":[1,2,3],"number":999};
	const { string, string2, array, number } = metadata;
	let thing = 27;
</script>

<script>
	import Layout_MDSVEX_DEFAULT from '${to_posix(
		join(__dirname, '..', '_fixtures', 'Layout.svelte')
	)}';
</script>

<Layout_MDSVEX_DEFAULT {...metadata}>

<h1>hello</h1>
</Layout_MDSVEX_DEFAULT>`),
			lines(output.code)
		);
	}
);

mdsvex_it(
	'User can provide a frontmatter function for non-YAML frontmatter',
	async () => {
		const parse_toml = (v, m) => {
			try {
				return toml.parse(v);
			} catch (e) {
				m.push(
					'Parsing error on line ' +
						e.line +
						', column ' +
						e.column +
						': ' +
						e.message
				);
			}
		};
		const output = await mdsvex({
			layout: join(__dirname, '..', '_fixtures', 'Layout.svelte'),
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

		assert.equal(
			lines(`<script context="module">
	export const metadata = {"title":"TOML Example","owner":{"name":"some name","dob":"1879-05-27T15:32:00.000Z"}};
	const { title, owner } = metadata;
	let thing = 27;
</script>

<script>
	import Layout_MDSVEX_DEFAULT from '${to_posix(
		join(__dirname, '..', '_fixtures', 'Layout.svelte')
	)}';
</script>

<Layout_MDSVEX_DEFAULT {...metadata}>

<h1>hello</h1>
</Layout_MDSVEX_DEFAULT>`),
			lines(output.code)
		);
	}
);

mdsvex_it(
	'Custom layouts can be an object of named layouts, mapping to folders',
	async () => {
		const output = await mdsvex({
			layout: {
				one: join(__dirname, '..', '_fixtures', 'Layout.svelte'),
				two: join(__dirname, '..', '_fixtures', 'LayoutTwo.svelte'),
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

		assert.equal(
			lines(`<script context="module">
	export const metadata = {"string":"value","string2":"value2","array":[1,2,3],"number":999};
	const { string, string2, array, number } = metadata;
	let thing = 27;
</script>

<script>
	import Layout_MDSVEX_DEFAULT from '${to_posix(
		join(__dirname, '..', '_fixtures', 'LayoutTwo.svelte')
	)}';
</script>

<Layout_MDSVEX_DEFAULT {...metadata}>

<h1>hello</h1>
</Layout_MDSVEX_DEFAULT>`),
			lines(output.code)
		);
	}
);

mdsvex_it('Ensure no-one tries to pass a "layouts" option', async () => {
	const output_fn = async () =>
		await mdsvex({
			//@ts-ignore
			layouts: {
				one: join(__dirname, '..', '_fixtures', 'Layout.svelte'),
				two: join(__dirname, '..', '_fixtures', 'LayoutTwo.svelte'),
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

	try {
		await output_fn();
		assert.unreachable('should have thrown error');
	} catch (e) {
		assert.instance(e, Error, '~> returns a true Error instance');
		assert.is(
			e.message,
			`mdsvex: "layouts" is not a valid option. Did you mean "layout"?`,
			`passing the option 'layouts' should throw a nice friendly error`
		);
	}
});

mdsvex_it('Warn on receiving unknown options', async () => {
	const output_fn = async () =>
		await mdsvex({
			//@ts-ignore
			bip: 'hi',
			bop: 'ho',
			boom: 'oh',
			layout: {
				one: join(__dirname, '..', '_fixtures', 'Layout.svelte'),
				two: join(__dirname, '..', '_fixtures', 'LayoutTwo.svelte'),
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
	console.warn = (args) => (warning = args);

	await output_fn();

	assert.equal(
		warning,
		'mdsvex: Received unknown options: bip, bop, boom. Valid options are: remarkPlugins, rehypePlugins, smartypants, extension, layout, highlight, frontmatter.'
	);

	console.warn = console_warn;
});

mdsvex_it(
	'Custom layout can be set via frontmatter - strange formatting',
	async () => {
		const output = await mdsvex({
			layout: {
				one: join(__dirname, '..', '_fixtures', 'Layout.svelte'),
				two: join(__dirname, '..', '_fixtures', 'LayoutTwo.svelte'),
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

		assert.equal(
			lines(`<script context="module">
	export const metadata = {"layout":"one","string":"value","string2":"value2","array":[1,2,3],"number":999};
	const { layout, string, string2, array, number } = metadata;
	let thing = 27;

</script>

<script>
	import Layout_MDSVEX_DEFAULT from '${to_posix(
		join(__dirname, '..', '_fixtures', 'Layout.svelte')
	)}';
</script>

<Layout_MDSVEX_DEFAULT {...metadata}>

<h1>hello</h1>
</Layout_MDSVEX_DEFAULT>`),
			lines(output.code)
		);
	}
);

mdsvex_it(
	'layout: false in front matter should remove any layouts',
	async () => {
		const output = await mdsvex({
			layout: join(__dirname, '..', '_fixtures', 'Layout.svelte'),
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

		assert.equal(
			lines(`<script context="module">
	export const metadata = {"layout":false};
	const { layout } = metadata;
	let thing = 27;
</script>


<h1>hello</h1>
`),
			lines(output.code)
		);
	}
);

mdsvex_it('Fallback layouts should work', async () => {
	const output = await mdsvex({
		layout: {
			one: join(__dirname, '..', '_fixtures', 'Layout.svelte'),
			two: join(__dirname, '..', '_fixtures', 'LayoutTwo.svelte'),
			_: join(__dirname, '..', '_fixtures', 'LayoutThree.svelte'),
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

	assert.equal(
		lines(`<script context="module">
	export const metadata = {"string":"value","string2":"value2","array":[1,2,3],"number":999};
	const { string, string2, array, number } = metadata;
	let thing = 27;
</script>

<script>
	import Layout_MDSVEX_DEFAULT from '${to_posix(
		join(__dirname, '..', '_fixtures', 'LayoutThree.svelte')
	)}';
</script>

<Layout_MDSVEX_DEFAULT {...metadata}>

<h1>hello</h1>
</Layout_MDSVEX_DEFAULT>`),
		lines(output.code)
	);
});

mdsvex_it('layout: allow custom components', async () => {
	const output = await mdsvex({
		layout: join(__dirname, '..', '_fixtures', 'LayoutWithComponents.svelte'),
	}).markup({
		content: `

<script context="module">
	let thing = 27;
</script>

# hello
`,
		filename: 'file.svx',
	});

	assert.equal(
		lines(`<script context="module">
	let thing = 27;
</script>

<script>
	import Layout_MDSVEX_DEFAULT, * as Components from '${to_posix(
		join(__dirname, '..', '_fixtures', 'LayoutWithComponents.svelte')
	)}';
</script>

<Layout_MDSVEX_DEFAULT>

<Components.h1>hello</Components.h1>
</Layout_MDSVEX_DEFAULT>`),
		lines(output.code)
	);
});

mdsvex_it('layout: allow custom components', async () => {
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

	assert.equal(
		lines(`<script context="module">
	let thing = 27;
</script>

<script>
	import Layout_MDSVEX_DEFAULT, * as Components from '${to_posix(
		join(__dirname, '..', '_fixtures', 'LayoutThreeWithComponents.svelte')
	)}';
</script>

<Layout_MDSVEX_DEFAULT>

<Components.h1>hello</Components.h1>
<Components.h2>hello</Components.h2>
<Components.h3>hello</Components.h3>
<Components.h4>hello</Components.h4>
<Components.p>hello <Components.em>hello</Components.em> <Components.strong>hello</Components.strong></Components.p>
</Layout_MDSVEX_DEFAULT>`),
		lines(output.code)
	);
});

mdsvex_it('layout: allow custom components', async () => {
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

	assert.equal(
		lines(`<script context="module">
	let thing = 27;
</script>

<script>
	import Layout_MDSVEX_DEFAULT, * as Components from '${to_posix(
		join(__dirname, '..', '_fixtures', 'LayoutTwoWithComponents.svelte')
	)}';
</script>

<Layout_MDSVEX_DEFAULT>

<Components.h1>hello</Components.h1>
<Components.p>I am some paragraph text</Components.p>
</Layout_MDSVEX_DEFAULT>`),
		lines(output.code)
	);
});

mdsvex_it('layout: allow custom components', async () => {
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

	assert.equal(
		lines(`<script context="module">
	let thing = 27;
</script>

<script>
	import Layout_MDSVEX_DEFAULT, * as Components from '${to_posix(
		join(__dirname, '..', '_fixtures', 'LayoutTwoWithComponents.svelte')
	)}';
</script>

<Layout_MDSVEX_DEFAULT>

<Components.h1>hello</Components.h1>
<Components.p>I am some paragraph text</Components.p>
</Layout_MDSVEX_DEFAULT>`),
		lines(output.code)
	);
});

mdsvex_it('layout: allow custom components', async () => {
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

	assert.equal(
		lines(`<script context="module">
	let thing = 27;
</script>

<script>
	import Layout_MDSVEX_DEFAULT, * as Components from '${to_posix(
		join(__dirname, '..', '_fixtures', 'LayoutTwoWithComponents.svelte')
	)}';
</script>

<Layout_MDSVEX_DEFAULT>

<Components.h1>hello</Components.h1>
<Components.p>I am some paragraph text</Components.p>
</Layout_MDSVEX_DEFAULT>`),
		lines(output.code)
	);
});

mdsvex_it('layout: allow custom components', async () => {
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
			extension: '.spooky',
		}
	);

	assert.equal(
		lines(`<script context="module">
	let thing = 27;
</script>

<script>
	import Layout_MDSVEX_DEFAULT, * as Components from '${to_posix(
		join(__dirname, '..', '_fixtures', 'LayoutTwoWithComponents.svelte')
	)}';
</script>

<Layout_MDSVEX_DEFAULT>

<Components.h1>hello</Components.h1>
<Components.p>I am some paragraph text</Components.p>
</Layout_MDSVEX_DEFAULT>`),
		lines(output.code)
	);
});

mdsvex_it.run();
