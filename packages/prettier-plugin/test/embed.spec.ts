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

	test('a const tag', async () => {
		expect(await svx('{@const  total=a+b}\n')).toBe('{@const total = a + b}\n');
		expect(await svx('{@const {x,y}=point}\n')).toBe(
			'{@const { x, y } = point}\n'
		);
	});

	test('a typed const tag in a typescript document', async () => {
		expect(
			await svx('<script lang="ts">\n</script>\n\n{@const  n:number=1}\n')
		).toBe('<script lang="ts"></script>\n\n{@const n: number = 1}\n');
	});

	test('a const tag inside a block', async () => {
		expect(
			await svx(
				'{#each items as item}\n\n{@const  name=item.name}\n\n{/each}\n'
			)
		).toBe('{#each items as item}\n\n  {@const name = item.name}\n\n{/each}\n');
	});

	test('a const tag that does not parse is kept', async () => {
		const sources = ['{@const  = 1}\n', '{@const  a = 1, b = 2;; }\n'];
		for (const source of sources) {
			expect(await svx(source)).toBe(
				source.replace('\n\nx\n\n', '\n\n  x\n\n')
			);
		}
	});
});

describe('blocks', () => {
	test('the head of an if, else if and key holds a formatted expression', async () => {
		expect(await svx('{#if a&&b}\n\nx\n\n{:else if  c}\n\ny\n\n{/if}\n')).toBe(
			'{#if a && b}\n\n  x\n\n{:else if c}\n\n  y\n\n{/if}\n'
		);
		expect(await svx('{#key  id}\n\nx\n\n{/key}\n')).toBe(
			'{#key id}\n\n  x\n\n{/key}\n'
		);
	});

	test('the content of a branch is printed too', async () => {
		expect(await svx('{#if a}\n\n{b+c}\n\n{/if}\n')).toBe(
			'{#if a}\n\n  {b + c}\n\n{/if}\n'
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
				`${out}\n\n  x\n\n{/each}\n`
			);
		}
	});

	test('an each head with a string that holds the keywords', async () => {
		expect(
			await svx("{#each fn(' as ', 'x, y') as item}\n\nx\n\n{/each}\n")
		).toBe('{#each fn(" as ", "x, y") as item}\n\n  x\n\n{/each}\n');
	});

	test('an await head and its then and catch branches', async () => {
		expect(
			await svx(
				'{#await  load(id)}\n\na\n\n{:then  {data}}\n\nb\n\n{:catch  e}\n\nc\n\n{/await}\n'
			)
		).toBe(
			'{#await load(id)}\n\n  a\n\n{:then { data }}\n\n  b\n\n{:catch e}\n\n  c\n\n{/await}\n'
		);
		expect(await svx('{#await p  then  [a,b]}\n\nx\n\n{/await}\n')).toBe(
			'{#await p then [a, b]}\n\n  x\n\n{/await}\n'
		);
		expect(await svx('{#await p.then(f)  catch err}\n\nx\n\n{/await}\n')).toBe(
			'{#await p.then(f) catch err}\n\n  x\n\n{/await}\n'
		);
		expect(await svx('{#await p then}\n\nx\n\n{/await}\n')).toBe(
			'{#await p then}\n\n  x\n\n{/await}\n'
		);
	});

	test('a snippet head', async () => {
		expect(await svx('{#snippet  row(item,i=0)}\n\nx\n\n{/snippet}\n')).toBe(
			'{#snippet row(item, i = 0)}\n\n  x\n\n{/snippet}\n'
		);
		expect(
			await svx(
				'<script lang="ts">\n</script>\n\n{#snippet row<T>(item:T, {a}:{a:string})}\n\nx\n\n{/snippet}\n'
			)
		).toBe(
			'<script lang="ts"></script>\n\n{#snippet row<T>(item: T, { a }: { a: string })}\n\n  x\n\n{/snippet}\n'
		);
	});

	test('a head that does not parse is kept', async () => {
		const sources = [
			'{#each items as }\n\nx\n\n{/each}\n',
			'{#each items as item, 1 }\n\nx\n\n{/each}\n',
			'{#snippet row(item: T)}\n\nx\n\n{/snippet}\n',
		];
		for (const source of sources) {
			expect(await svx(source)).toBe(
				source.replace('\n\nx\n\n', '\n\n  x\n\n')
			);
		}
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
	test('attributes on one line when the tag fits', async () => {
		expect(await svx('<Test value={count}    label="a"  />\n')).toBe(
			'<Test value={count} label="a" />\n'
		);
		expect(await svx('<Foo\n    a={x+1}\n    b="c"\n>\n\nx\n\n</Foo>\n')).toBe(
			'<Foo a={x + 1} b="c">\n\n  x\n\n</Foo>\n'
		);
	});

	test('one attribute to a line when it does not', async () => {
		expect(
			await svx(
				'<Component alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo />\n'
			)
		).toBe(
			'<Component\n  alpha\n  bravo\n  charlie\n  delta\n  echo\n  foxtrot\n  golf\n  hotel\n  india\n  juliet\n  kilo\n/>\n'
		);
	});

	test('bracketSameLine keeps the bracket on the last attribute', async () => {
		expect(
			await svx(
				'<Component alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima>\n\nx\n\n</Component>\n',
				{ bracketSameLine: true }
			)
		).toBe(
			'<Component\n  alpha\n  bravo\n  charlie\n  delta\n  echo\n  foxtrot\n  golf\n  hotel\n  india\n  juliet\n  kilo\n  lima>\n\n  x\n\n</Component>\n'
		);
	});

	test('singleAttributePerLine', async () => {
		expect(
			await svx('<Foo a="1" b="2" />\n', { singleAttributePerLine: true })
		).toBe('<Foo\n  a="1"\n  b="2"\n/>\n');
	});

	test('values in double quotes, a lone expression unquoted', async () => {
		expect(await svx('<a href=\'/x\' title=hi data-x="{y}">t</a>\n')).toBe(
			'<a href="/x" title="hi" data-x={y}>t</a>\n'
		);
	});

	test('shorthand, spread and attach', async () => {
		expect(
			await svx(
				'<Foo { a } b={b} bind:value={value} {...  props} {@attach  tip( x )}/>\n'
			)
		).toBe('<Foo {a} {b} bind:value {...props} {@attach tip(x)} />\n');
	});

	test('an expression in a quoted value, kept when its quotes would clash', async () => {
		expect(await svx("<a href='/x/{id+1}'>a</a>\n")).toBe(
			'<a href="/x/{id + 1}">a</a>\n'
		);
		expect(await svx('<a title="Hi {first+\' \'+last}">a</a>\n')).toBe(
			'<a title="Hi {first+\' \'+last}">a</a>\n'
		);
	});

	test('the spaces in a quoted value are kept', async () => {
		expect(await svx('<div title="a   b">\n\nx\n\n</div>\n')).toBe(
			'<div title="a   b">\n\n  x\n\n</div>\n'
		);
	});

	test('an expression over lines is formatted in its tag', async () => {
		expect(await svx('<Foo a={() => {\n  go();\n}} />\n')).toBe(
			'<Foo\n  a={() => {\n    go();\n  }}\n/>\n'
		);
	});

	test('in a paragraph, a list and a quote a tag stays on its line', async () => {
		expect(
			await svx(
				'see <a href={url+"/x"}>it</a>\n\n- <b x={ 1 }>b</b>\n\n> <i y={ 2 }>i</i>\n'
			)
		).toBe(
			'see <a href={url + "/x"}>it</a>\n\n- <b x={1}>b</b>\n\n> <i y={2}>i</i>\n'
		);
	});

	test('the children are formatted and indented', async () => {
		expect(await svx('<div a={ x }>\n\n{b+c}\n\n</div>\n')).toBe(
			'<div a={x}>\n\n  {b + c}\n\n</div>\n'
		);
	});

	test('a tag with a brace that does not close is kept', async () => {
		expect(await svx('<Counter prop="{[1, 2]]}"/>\n')).toBe(
			'<Counter prop="{[1, 2]]}" />\n'
		);
	});
});
