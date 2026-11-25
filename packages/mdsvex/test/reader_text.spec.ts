import { describe, expect, test } from 'vitest';

import { compile } from '../src/main';
import type { CompileOptions, ParsePlugin } from '../src/main';

/** the text of every heading and paragraph as ctx.text reads it when the block closes */
function reader(): ParsePlugin {
	const block: ParsePlugin['heading'] = {
		parse: (node, ctx) => () => ctx.add('text', ctx.text(node)),
	};
	return { name: 'reader', heading: block, paragraph: block };
}

/** the same once the document is whole, when no delimiter waits for its closer */
function settled(): ParsePlugin {
	return {
		name: 'reader',
		document(root, ctx) {
			for (let node = root.first_child; node !== null; node = node.next) {
				if (node.type === 'heading' || node.type === 'paragraph')
					ctx.add('text', ctx.text(node));
			}
		},
	};
}

function read(
	source: string,
	options: CompileOptions = {},
	plugin: ParsePlugin = reader()
) {
	const result = compile(source, { ...options, parse_plugins: [plugin] });
	return {
		text: (result.data?.reader?.text ?? []) as string[],
		code: result.code,
	};
}

const BLOCK = /<(h[1-6]|p)(?:\s[^>]*)?>([^]*?)<\/\1>/g;
const TAG = /<[^>]*>/g;
const ENTITY = /&(?:#(\d+)|(amp|lt|gt|quot));/g;
const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"' };

/** what a browser shows of each heading and paragraph of the rendered code */
function shown(code: string): string[] {
	const out: string[] = [];
	for (const match of code.matchAll(BLOCK)) {
		out.push(
			match[2]
				.replace(TAG, '')
				// an escaped brace is a reference, so these are expressions
				.replace(/\{[^}]*\}/g, '')
				.replace(ENTITY, (_all, decimal, name) =>
					decimal !== undefined
						? String.fromCodePoint(Number(decimal))
						: NAMED[name]
				)
				.replace(/\n/g, ' ')
		);
	}
	return out;
}

describe('ctx.text', () => {
	test('is the text as written without smart punctuation', () => {
		const { text } = read(`## Let's "go" -- and...\n`);
		expect(text).toEqual([`Let's "go" -- and...`]);
	});

	test('has the smart punctuation of the compile', () => {
		const { text, code } = read(
			`## Let's go\n\n## "Quoted" -- and...\n\n## a --- b\n`,
			{ smart_punctuation: true, heading_ids: true }
		);
		expect(text).toEqual(['Let’s go', '“Quoted” – and…', 'a — b']);
		expect(code).toContain('<h2 id="lets-go">Let’s go</h2>');
	});

	test('leaves a kind that is off as written', () => {
		const { text } = read(`## "a" -- b...\n`, {
			smart_punctuation: { dashes: false, ellipses: false },
		});
		expect(text).toEqual(['“a” -- b...']);
	});

	test('takes the quotes of the option', () => {
		const { text } = read(`## "a" and 'b'\n`, {
			smart_punctuation: { quotes: ['«', '»', '‹', '›'] },
		});
		expect(text).toEqual(['«a» and ‹b›']);
	});

	test('reads a quote at the edge of a node from the text beside it', () => {
		const { text } = read(`## **It**'s "*go*" '[now](/now)'\n`, {
			smart_punctuation: true,
		});
		expect(text).toEqual(['It’s “go” ‘now’']);
	});

	test('leaves code, an autolink, an alt and an escaped character as written', () => {
		const { text } = read(
			[
				"## `it's --` and <code>it's</code>",
				'## <https://a.test/it--s>',
				`## ![it's](a.png) it's`,
				`## \\"a\\" \\-- b`,
				'',
			].join('\n\n'),
			{ smart_punctuation: true }
		);
		expect(text).toEqual([
			"it's -- and it's",
			'https://a.test/it--s',
			"it's it’s",
			'"a" -- b',
		]);
	});

	test('leaves a flag as written', () => {
		const { text } = read('## run --watch and a--b\n', {
			smart_punctuation: true,
		});
		expect(text).toEqual(['run --watch and a–b']);
	});

	test('a reference is its character, an escaped one its characters', () => {
		const { text } = read('## a &amp; b &#38; c \\&amp; d &copy;\n');
		expect(text).toEqual(['a & b & c &amp; d &copy;']);
	});

	test('a line end is a space, a comment and an expression are nothing', () => {
		const { text } = read('a <!-- no --> b\n{c} d\n');
		expect(text).toEqual(['a  b  d']);
	});

	test('the text of a text node alone has its punctuation too', () => {
		const plugin: ParsePlugin = {
			name: 'reader',
			heading: {
				parse: (node, ctx) => () => {
					for (let child = node.first_child; child; child = child.next)
						if (child.type === 'text') ctx.add('text', ctx.text(child));
				},
			},
		};
		const result = compile(`## "a *b*" it's\n`, {
			smart_punctuation: true,
			parse_plugins: [plugin],
		});
		expect(result.data?.reader?.text).toEqual(['“a ', '” it’s']);
	});

	// each piece is one the renderer reads in a way of its own
	const PIECES = [
		'"',
		"'",
		'--',
		'---',
		'-',
		'...',
		'.',
		' ',
		' ',
		'a',
		'b',
		'1',
		'*',
		'**',
		'_',
		'`',
		'(',
		')',
		'\\',
		'~~',
		'&amp;',
		'é',
		'—',
		'^',
		'[',
		'](/u)',
		'<b>',
		'</b>',
		'<code>',
		'</code>',
		'<!--c-->',
		'{1}',
		'\\"',
		"\\'",
		'\n',
	];

	function documents(count: number): string[] {
		let seed = 0x2f6e2b1;
		const next = (): number => {
			seed ^= seed << 13;
			seed ^= seed >>> 17;
			seed ^= seed << 5;
			return (seed >>> 0) / 0x100000000;
		};
		const out: string[] = [];
		for (let i = 0; i < count; i++) {
			let line = 'x';
			const length = 2 + Math.floor(next() * 10);
			for (let j = 0; j < length; j++)
				line += PIECES[Math.floor(next() * PIECES.length)];
			// a line of its own would start a block of another kind
			line = line.replace(/\n(?=[-.\s]|$)/g, ' ');
			// a footnote reference needs its definition
			out.push(line.replace(/\[\^/g, '[') + 'x');
		}
		return out;
	}

	test('reads what the renderer shows', () => {
		const differ: [string, string, string][] = [];
		for (const line of documents(10000)) {
			for (const source of [`## ${line.replace(/\n/g, ' ')}\n`, `${line}\n`]) {
				const { text, code } = read(
					source,
					{ smart_punctuation: true },
					settled()
				);
				const want = shown(code);
				// a line end in a code span is one in the code
				const got = text.map((t) => t.replace(/\n/g, ' '));
				if (got.length !== want.length || got.some((t, i) => t !== want[i]))
					differ.push([source, got.join('|'), want.join('|')]);
			}
		}
		expect(differ.slice(0, 10)).toEqual([]);
	});
});
