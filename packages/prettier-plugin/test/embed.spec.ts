import { format } from 'prettier';
import type { Options } from 'prettier';
import { describe, expect, test } from 'vitest';

import plugin from '../src/index';

function svx(source: string, options: Options = {}): Promise<string> {
	return format(source, { parser: 'mdsvex', plugins: [plugin], ...options });
}

describe('frontmatter', () => {
	test('is formatted as yaml', async () => {
		expect(await svx('---\ntitle:   hi\ntags: [ a,b ]\n---\n\n# a\n')).toBe(
			'---\ntitle: hi\ntags: [a, b]\n---\n\n# a\n'
		);
	});

	test('an empty one keeps its fences', async () => {
		expect(await svx('---\n---\n')).toBe('---\n---\n');
	});

	test('one that is not yaml is kept', async () => {
		const source = '---\n: : [\n---\n';
		expect(await svx(source)).toBe(source);
	});
});

describe('imports', () => {
	test('are formatted as code', async () => {
		expect(
			await svx('import A from \'./a.svelte\'\nimport {b,c} from "d"\n\n# a\n')
		).toBe('import A from "./a.svelte";\nimport { b, c } from "d";\n\n# a\n');
	});

	test('follow the options of the project', async () => {
		expect(
			await svx('import { a } from "b";\n', { singleQuote: true, semi: false })
		).toBe("import { a } from 'b'\n");
	});

	test('one too long for a line breaks over lines', async () => {
		const out = await svx(
			"import { alpha, bravo, charlie, delta, echo, foxtrot, golf } from './letters.js';\n"
		);
		expect(out).toBe(
			'import {\n\talpha,\n\tbravo,\n\tcharlie,\n\tdelta,\n\techo,\n\tfoxtrot,\n\tgolf,\n} from "./letters.js";\n'.replace(
				/\t/g,
				'  '
			)
		);
	});
});

describe('script and style', () => {
	test('a script is formatted and indented', async () => {
		expect(await svx('<script>\nlet a=1\nconst b = {c:2}\n</script>\n')).toBe(
			'<script>\n  let a = 1;\n  const b = { c: 2 };\n</script>\n'
		);
	});

	test('a typescript script keeps its types', async () => {
		expect(await svx('<script lang="ts">\nlet a:number=1\n</script>\n')).toBe(
			'<script lang="ts">\n  let a: number = 1;\n</script>\n'
		);
	});

	test('indents with tabs when the project does', async () => {
		expect(await svx('<script>\nlet a=1\n</script>\n', { useTabs: true })).toBe(
			'<script>\n\tlet a = 1;\n</script>\n'
		);
	});

	test('a style is formatted as css, scss when it says so', async () => {
		expect(await svx('<style>\na{color:red}\n</style>\n')).toBe(
			'<style>\n  a {\n    color: red;\n  }\n</style>\n'
		);
		expect(await svx('<style lang="scss">\na{b{color:red}}\n</style>\n')).toBe(
			'<style lang="scss">\n  a {\n    b {\n      color: red;\n    }\n  }\n</style>\n'
		);
	});

	test('a script that does not parse is kept', async () => {
		const source = '<script>\nlet = = 1\n</script>\n';
		expect(await svx(source)).toBe(source);
	});

	test('a style in a language prettier has no parser for is kept', async () => {
		const source = '<style lang="stylus">\na\n  color red\n</style>\n';
		expect(await svx(source)).toBe(source);
	});
});

describe('expressions', () => {
	test('in prose are formatted on one line', async () => {
		expect(await svx('# {a+b}\n\nsee {fn( x,y )} here\n')).toBe(
			'# {a + b}\n\nsee {fn(x, y)} here\n'
		);
	});

	test('in a list and a quote', async () => {
		expect(await svx('- {  foo  }\n\n> {a?b:c}\n')).toBe(
			'- {foo}\n\n> {a ? b : c}\n'
		);
	});

	test('use typescript when a script does', async () => {
		expect(await svx('<script lang="ts">\n</script>\n\n{a as  string}\n')).toBe(
			'<script lang="ts"></script>\n\n{a as string}\n'
		);
	});

	test('one alone in a paragraph keeps the lines it took', async () => {
		expect(await svx('{items.map(\n(item) => item.name\n)}\n')).toBe(
			'{items.map((item) => item.name)}\n'
		);
	});

	test('one over lines inside a quote is kept', async () => {
		const source = '> {a(\n> b)}\n';
		expect(await svx(source)).toBe(source);
	});

	test('one that does not parse is kept', async () => {
		expect(await svx('a {b c} d\n')).toBe('a {b c} d\n');
	});

	test('html and render tags', async () => {
		expect(await svx('{@html  marked(x)}\n\n{@render  child( )}\n')).toBe(
			'{@html marked(x)}\n\n{@render child()}\n'
		);
	});

	test('a const tag is kept', async () => {
		expect(await svx('{@const  a=1}\n')).toBe('{@const  a=1}\n');
	});
});

describe('blocks', () => {
	test('the head of an if, else if and key holds a formatted expression', async () => {
		expect(await svx('{#if a&&b}\n\nx\n\n{:else if  c}\n\ny\n\n{/if}\n')).toBe(
			'{#if a && b}\n\nx\n\n{:else if c}\n\ny\n\n{/if}\n'
		);
		expect(await svx('{#key  id}\n\nx\n\n{/key}\n')).toBe(
			'{#key id}\n\nx\n\n{/key}\n'
		);
	});

	test('the content of a branch is printed too', async () => {
		expect(await svx('{#if a}\n\n{b+c}\n\n{/if}\n')).toBe(
			'{#if a}\n\n{b + c}\n\n{/if}\n'
		);
	});

	test('an each head, with its binding, index and key', async () => {
		const cases: [string, string][] = [
			['{#each  items as item}', '{#each items as item}'],
			[
				'{#each list.filter(x=>x.ok) as {id,name}, i (id)}',
				'{#each list.filter((x) => x.ok) as { id, name }, i (id)}',
			],
			['{#each items as [a,b]}', '{#each items as [a, b]}'],
			['{#each items as item (item.id)}', '{#each items as item (item.id)}'],
			['{#each items as { a = f( 1 ) }}', '{#each items as { a = f(1) }}'],
			['{#each {length:3}, i}', '{#each { length: 3 }, i}'],
			['{#each  items}', '{#each items}'],
		];
		for (const [head, out] of cases) {
			expect(await svx(`${head}\n\nx\n\n{/each}\n`)).toBe(
				`${out}\n\nx\n\n{/each}\n`
			);
		}
	});

	test('an each head with a string that holds the keywords', async () => {
		expect(
			await svx("{#each fn(' as ', 'x, y') as item}\n\nx\n\n{/each}\n")
		).toBe('{#each fn(" as ", "x, y") as item}\n\nx\n\n{/each}\n');
	});

	test('an await head and its then and catch branches', async () => {
		expect(
			await svx(
				'{#await  load(id)}\n\na\n\n{:then  {data}}\n\nb\n\n{:catch  e}\n\nc\n\n{/await}\n'
			)
		).toBe(
			'{#await load(id)}\n\na\n\n{:then { data }}\n\nb\n\n{:catch e}\n\nc\n\n{/await}\n'
		);
		expect(await svx('{#await p  then  [a,b]}\n\nx\n\n{/await}\n')).toBe(
			'{#await p then [a, b]}\n\nx\n\n{/await}\n'
		);
		expect(await svx('{#await p.then(f)  catch err}\n\nx\n\n{/await}\n')).toBe(
			'{#await p.then(f) catch err}\n\nx\n\n{/await}\n'
		);
		expect(await svx('{#await p then}\n\nx\n\n{/await}\n')).toBe(
			'{#await p then}\n\nx\n\n{/await}\n'
		);
	});

	test('a snippet head', async () => {
		expect(await svx('{#snippet  row(item,i=0)}\n\nx\n\n{/snippet}\n')).toBe(
			'{#snippet row(item, i = 0)}\n\nx\n\n{/snippet}\n'
		);
		expect(
			await svx(
				'<script lang="ts">\n</script>\n\n{#snippet row<T>(item:T, {a}:{a:string})}\n\nx\n\n{/snippet}\n'
			)
		).toBe(
			'<script lang="ts"></script>\n\n{#snippet row<T>(item: T, { a }: { a: string })}\n\nx\n\n{/snippet}\n'
		);
	});

	test('a head that does not parse is kept', async () => {
		const sources = [
			'{#each items as }\n\nx\n\n{/each}\n',
			'{#each items as item, 1 }\n\nx\n\n{/each}\n',
			'{#snippet row(item: T)}\n\nx\n\n{/snippet}\n',
		];
		for (const source of sources) expect(await svx(source)).toBe(source);
	});
});

describe('fences', () => {
	const js = '```js\nlet a=1\n```\n';

	test('are kept by default', async () => {
		expect(await svx(js)).toBe(js);
	});

	test('are formatted with mdsvexFormatFences', async () => {
		expect(await svx(js, { mdsvexFormatFences: true } as Options)).toBe(
			'```js\nlet a = 1;\n```\n'
		);
		expect(
			await svx('```css\na{color:red}\n```\n', {
				mdsvexFormatFences: true,
			} as Options)
		).toBe('```css\na {\n  color: red;\n}\n```\n');
	});

	test('with meta, annotations or an unknown language are kept', async () => {
		const sources = [
			'```js {1}\nlet a=1\n```\n',
			'```js\nlet a=1 // [!hl]\n```\n',
			'```eval\nlet a=1\n```\n',
			'```nope\nlet a=1\n```\n',
			'```md\n*a*\n```\n',
		];
		for (const source of sources) {
			expect(await svx(source, { mdsvexFormatFences: true } as Options)).toBe(
				source
			);
		}
	});

	test('inside a list are kept', async () => {
		const source = '- a\n\n  ```js\n  let a=1\n  ```\n';
		expect(await svx(source, { mdsvexFormatFences: true } as Options)).toBe(
			source
		);
	});
});

describe('open tags', () => {
	test('the spaces between attributes fold to one', async () => {
		expect(await svx('<Test value={count}    label="a"  />\n')).toBe(
			'<Test value={count} label="a" />\n'
		);
		expect(await svx('<div class="a"   >\n\nx\n\n</div>\n')).toBe(
			'<div class="a">\n\nx\n\n</div>\n'
		);
	});

	test('attribute expressions are formatted on one line', async () => {
		expect(
			await svx('<button onclick={()=>count++} disabled={ !ok }>go</button>\n')
		).toBe('<button onclick={() => count++} disabled={!ok}>go</button>\n');
	});

	test('shorthand, spread and attach', async () => {
		expect(await svx('<Foo { a } {...  props} {@attach  tip( x )}/>\n')).toBe(
			'<Foo {a} {...props} {@attach tip(x)}/>\n'
		);
	});

	test('an expression in a quoted value, kept when its quotes would clash', async () => {
		expect(await svx("<a href='/x/{id+1}'>a</a>\n")).toBe(
			"<a href='/x/{id + 1}'>a</a>\n"
		);
		const clash = '<a title="Hi {first+\' \'+last}">a</a>\n';
		expect(await svx(clash)).toBe(clash);
	});

	test('the spaces in a quoted value are kept', async () => {
		const source = '<div title="a   b">\n\nx\n\n</div>\n';
		expect(await svx(source)).toBe(source);
	});

	test('an open tag over lines keeps its lines and indent', async () => {
		expect(await svx('<Foo\n    a={x+1}\n    b="c"\n>\n\nx\n\n</Foo>\n')).toBe(
			'<Foo\n    a={x + 1}\n    b="c"\n>\n\nx\n\n</Foo>\n'
		);
	});

	test('an expression over lines in an attribute is kept', async () => {
		const source = '<Foo a={() => {\n  go();\n}} />\n';
		expect(await svx(source)).toBe(source);
	});

	test('in a paragraph, a list and a quote', async () => {
		expect(
			await svx(
				'see <a href={url+"/x"}>it</a>\n\n- <b x={ 1 }>b</b>\n\n> <i y={ 2 }>i</i>\n'
			)
		).toBe(
			'see <a href={url + "/x"}>it</a>\n\n- <b x={1}>b</b>\n\n> <i y={2}>i</i>\n'
		);
	});

	test('the children are formatted too', async () => {
		expect(await svx('<div a={ x }>\n\n{b+c}\n\n</div>\n')).toBe(
			'<div a={x}>\n\n{b + c}\n\n</div>\n'
		);
	});

	test('a tag with a brace that does not close is kept', async () => {
		const source = '<Counter prop="{[1, 2]]}"/>\n';
		expect(await svx(source)).toBe(source);
	});
});
