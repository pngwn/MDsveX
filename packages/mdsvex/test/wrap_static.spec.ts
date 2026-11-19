import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { compile, compile_inputs, CompilerSession } from '../src/compile';
import type { CompileOptions, TraceTarget } from '../src/compile';
import { all_directives } from './utils';

const OPEN = '<div style="display: contents">';
const CLOSE = '</div>';

function target(): TraceTarget {
	return {
		source: '',
		html: '',
		metadata: undefined,
		template: undefined,
		warnings: undefined,
		buf: new Uint32Array(0),
		start: 0,
		split: 0,
		end: 0,
	};
}

function into(raw: string, options: CompileOptions): TraceTarget {
	const out = target();
	new CompilerSession().compile_into(raw, compile_inputs(options), out);
	return out;
}

const SOURCE =
	"<script>\n\timport Counter from './Counter.svelte';\n\tlet n = $state(0);\n</script>\n\n# Title\n\nSome *static* text.\n\nMore.\n\n<Counter />\n\nCount is {n}.\n\n- a\n- b\n\n> quote\n\n---\n\nalone\n\n{#if n}\n\nshown\n\n{/if}\n";

describe('wrap_static', () => {
	it('is off by default', () => {
		const plain = compile(SOURCE).code;
		expect(plain).not.toContain(OPEN);
		expect(compile(SOURCE, { wrap_static: false }).code).toBe(plain);
	});

	it('wraps each run of two or more static blocks', () => {
		expect(compile(SOURCE, { wrap_static: true }).code).toBe(
			"<script>\n\timport Counter from './Counter.svelte';\n\tlet n = $state(0);\n</script>" +
				OPEN +
				'<h1>Title</h1><p>Some <strong>static</strong> text.</p><p>More.</p>' +
				CLOSE +
				'<Counter /><p>Count is {n}.</p>' +
				OPEN +
				'<ul>\n<li>a</li>\n<li>b</li>\n\n</ul><blockquote>\n<p>quote</p>\n</blockquote><hr /><p>alone</p>' +
				CLOSE +
				'{#if n}\n<p>shown</p>{/if}'
		);
	});

	it('leaves a single static block between dynamic ones alone', () => {
		const src = '{a}\n\nstatic\n\n{b}\n';
		expect(compile(src, { wrap_static: true }).code).toBe(compile(src).code);
	});

	it('keeps out every block svelte has to find', () => {
		const dynamic = [
			'<Box />',
			'<ui.Box />',
			'<svelte:head><title>t</title></svelte:head>',
			'<div use:tip>x</div>',
			'<div class:on>x</div>',
			'<a href="/{x}">y</a>',
			'text {x}',
			'<style>p { color: red }</style>',
		];
		for (const block of dynamic) {
			const src = `a\n\n${block}\n\nb\n`;
			expect(compile(src, { wrap_static: true }).code, block).toBe(
				compile(src).code
			);
		}
	});

	it('takes comments, links, escaped braces and typed html with plain attributes', () => {
		const src =
			'a [link](https://e.com/x?a=1:2)\n\n<!-- a {note} -->\n\n<div class="x" data-a=\'1\'>typed</div>\n\n```js\nlet a = { b };\n```\n';
		const code = compile(src, { wrap_static: true }).code;
		expect(code.startsWith(OPEN)).toBe(true);
		expect(code.endsWith(CLOSE)).toBe(true);
		expect(code.slice(OPEN.length, -CLOSE.length)).toBe(compile(src).code);
	});

	it('keeps a replaced element out of a run', () => {
		const components = [{ specifier: '$lib/md.ts', names: ['h1'] }];
		const src = '# a\n\nb\n\nc\n\n# d\n';
		const code = compile(src, { wrap_static: true, components }).code;
		expect(code).toContain(OPEN + '<p>b</p><p>c</p>' + CLOSE);
		expect(code.split(OPEN).length).toBe(2);
	});

	it('wraps inside a template and leaves the hoisted children before it', () => {
		const templates = { default: { specifier: '$lib/Post.svelte' } };
		const src =
			'<script>\n\tlet n = $state(0);\n</script>\n\n# a\n\nb\n\n{n}\n\nc\n\nd\n';
		const plain = compile(src, { templates }).code;
		const code = compile(src, { templates, wrap_static: true }).code;
		expect(code).toBe(
			plain
				.replace('<h1>a</h1>', OPEN + '<h1>a</h1>')
				.replace('<p>b</p>', '<p>b</p>' + CLOSE)
				.replace('<p>c</p>', OPEN + '<p>c</p>')
				.replace('<p>d</p>', '<p>d</p>' + CLOSE)
		);
	});

	it('every entry point renders the same html', () => {
		const options = { wrap_static: true };
		const html = compile(SOURCE, options).code;
		expect(compile(SOURCE, { ...options, sourcemap: true }).code).toBe(html);
		expect(into(SOURCE, options).html).toBe(html);
		// a kept renderer forgets the option
		const session = new CompilerSession();
		const out = target();
		session.compile_into(SOURCE, compile_inputs(options), out);
		session.compile_into(SOURCE, compile_inputs(), out);
		expect(out.html).toBe(compile(SOURCE).code);
	});
});

const FIXTURES = resolve(
	dirname(fileURLToPath(import.meta.url)),
	'../../parse/test/fixtures'
);

function fixture_files(dir: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) files.push(...fixture_files(path));
		else if (/\.(md|svx)$/.test(entry.name)) files.push(path);
	}
	return files.sort();
}

// some fixtures open with frontmatter that is not yaml, keep it as metadata
const frontmatter = { parse: (raw: string) => ({ raw }) };

/** the html with each wrapper the option added taken out, and where each output offset moved */
function unwrap(html: string): { html: string; at: (gen: number) => number } {
	const cuts: [number, number][] = [];
	let out = '';
	let i = 0;
	// true for a wrapper, false for a div the author typed, so a typed </div> closes its own
	const open: boolean[] = [];
	const re = /<div style="display: contents">|<div[\s>/]|<\/div>/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(html)) !== null) {
		if (m[0] === OPEN) open.push(true);
		else if (m[0] !== CLOSE) {
			open.push(false);
			continue;
		} else if (open.pop() !== true) continue;
		out += html.slice(i, m.index);
		cuts.push([m.index, m[0].length]);
		i = m.index + m[0].length;
	}
	out += html.slice(i);
	return {
		html: out,
		at(gen) {
			let shift = 0;
			for (const [index, length] of cuts) if (index < gen) shift += length;
			return gen - shift;
		},
	};
}

describe('wrap_static over the parser fixtures', () => {
	const files = fixture_files(FIXTURES);

	it('only adds wrappers, and every mapping still points at its text', () => {
		let wrapped = 0;
		for (const file of files) {
			const raw = readFileSync(file, 'utf8');
			const base = {
				sourcemap: true,
				frontmatter,
				directives: all_directives(raw),
			};
			const plain = compile(raw, base);
			const got = compile(raw, { ...base, wrap_static: true });
			if (got.code !== plain.code) wrapped++;
			const back = unwrap(got.code);
			expect(back.html, file).toBe(plain.code);
			// the same records in the same order, each moved by the wrappers before it
			const a = plain.mappings!;
			const b = got.mappings!;
			expect(b.length, file).toBe(a.length);
			for (let k = 0; k < a.length; k++) {
				expect(b[k].sourceOffsets, file).toEqual(a[k].sourceOffsets);
				expect(b[k].generatedOffsets.map(back.at), file).toEqual(
					a[k].generatedOffsets
				);
			}

			// the trace walk moves its records the same way
			const t_plain = into(raw, { frontmatter, directives: base.directives });
			const t_got = into(raw, {
				frontmatter,
				directives: base.directives,
				wrap_static: true,
			});
			expect(t_got.html, file).toBe(got.code);
			const pa = t_plain.buf.subarray(t_plain.start, t_plain.end);
			const pb = t_got.buf.subarray(t_got.start, t_got.end);
			expect(pb.length, file).toBe(pa.length);
			for (let k = 0; k < pa.length; k += 3) {
				expect(back.at(pb[k]), file).toBe(pa[k]);
				expect(pb[k + 1], file).toBe(pa[k + 1]);
				expect(pb[k + 2], file).toBe(pa[k + 2]);
			}
		}
		expect(wrapped).toBeGreaterThan(50);
	});
});
