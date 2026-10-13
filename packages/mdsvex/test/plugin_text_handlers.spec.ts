import { compile as svelte_compile } from 'svelte/compiler';
import { describe, expect, test } from 'vitest';

import { compile, CompilerSession } from '../src/main';
import type { ParsePlugin, TextRun } from '../src/main';

const PARTY = '\u{1f389}';

function each(
	run: TextRun,
	pattern: RegExp,
	put: (m: RegExpExecArray) => void
) {
	for (const match of run.text.matchAll(pattern)) put(match);
}

const emoji: ParsePlugin = {
	sequential: true,
	text(run) {
		each(run, /:(tada|brace|ref):/g, (m) => {
			const to =
				m[1] === 'tada' ? PARTY : m[1] === 'brace' ? '{x}' : 'a&amp;<b>';
			run.replace(m.index, m.index + m[0].length, 'text', to);
		});
	},
};

const issues: ParsePlugin = {
	sequential: true,
	text(run) {
		each(run, /#(\d+)/g, (m) => {
			run
				.replace(m.index, m.index + m[0].length, 'link', {
					href: `/issues/${m[1]}?a=1&b=2`,
				})
				.append('text', m[0]);
		});
	},
};

const html = (source: string, options?: Parameters<typeof compile>[1]) =>
	compile(source, { parse_plugins: [emoji, issues], ...options }).code;

describe('text a plugin rewrites', () => {
	test('renders in place of what it replaced', () => {
		expect(html('We shipped :tada: in #12.\n')).toBe(
			`<p>We shipped ${PARTY} in <a href="/issues/12?a=1&amp;b=2">#12</a>.</p>`
		);
	});

	test('is escaped as characters, the text around it as the author wrote it', () => {
		const out = html('AT&amp;T {name} :brace: :ref: <b>x</b>\n');
		expect(out).toBe(
			'<p>AT&amp;T {name} &#123;x&#125; a&amp;amp;&lt;b&gt; <b>x</b></p>'
		);
		expect(() =>
			svelte_compile(`<script>let name = 1;</script>${out}`, {})
		).not.toThrow();
	});

	test('renders in headings, lists, tables and links', () => {
		expect(
			html(
				'# Done :tada:\n\n- one :tada:\n\n| a :tada: |\n|---|\n| #4 |\n\n[:tada: go](/u)\n'
			)
		).toBe(
			[
				`<h1>Done ${PARTY}</h1><ul>`,
				`<li>one ${PARTY}</li>`,
				'',
				'</ul><table>',
				'<thead>',
				'<tr>',
				`<th>a ${PARTY}</th>`,
				'</tr>',
				'</thead>',
				'<tbody>',
				'<tr>',
				'<td><a href="/issues/4?a=1&amp;b=2">#4</a></td>',
				'</tr>',
				'</tbody>',
				`</table><p><a href="/u">${PARTY} go</a></p>`,
			].join('\n')
		);
	});

	test('leaves code, math, urls and attributes alone', () => {
		const source =
			'`:tada:` <https://x.io/:tada:> [x](/:tada: ":tada:") <i title=":tada:">y</i>\n\n```\n:tada: #1\n```\n';
		expect(html(source)).toBe(compile(source).code);
	});

	test('leaves a document it matches nothing in exactly as it was', () => {
		const source = '# A "b"\n\nsome *text* with a [link](/u) and `code`\n';
		for (const options of [{}, { smart_punctuation: true }]) {
			expect(html(source, options)).toBe(compile(source, options).code);
		}
	});

	test('keeps smart punctuation on the text around a replacement', () => {
		expect(
			html('"hello :tada:" -- it\'s #5...\n', { smart_punctuation: true })
		).toBe(
			`<p>“hello ${PARTY}” – it’s <a href="/issues/5?a=1&amp;b=2">#5</a>…</p>`
		);
	});

	test('does not change a heading id, which is made from the source', () => {
		expect(html('# Done :tada:\n', { heading_ids: true })).toBe(
			`<h1 id="done-tada">Done ${PARTY}</h1>`
		);
	});

	test('maps the text around a replacement and the node that replaced a range', () => {
		const source = 'before :tada: middle #12 after\n';
		const out = compile(source, {
			parse_plugins: [emoji, issues],
			sourcemap: true,
		});
		const code = out.code;
		const spans = out.mappings!.map((m) => [
			m.data.role,
			source.slice(m.sourceOffsets[0], m.sourceOffsets[0] + m.lengths[0]),
			code.slice(
				m.generatedOffsets[0],
				m.generatedOffsets[0] + (m.generatedLengths ?? m.lengths)[0]
			),
		]);
		expect(spans).toContainEqual(['content', 'before ', 'before ']);
		expect(spans).toContainEqual(['content', ' middle ', ' middle ']);
		expect(spans).toContainEqual(['content', ' after', ' after']);
		expect(spans).toContainEqual([
			'node',
			'#12',
			'<a href="/issues/12?a=1&amp;b=2">#12</a>',
		]);
	});

	test('is the same in a compiler session, document after document', () => {
		const session = new CompilerSession();
		const options = { parse_plugins: [emoji, issues] };
		const docs = [
			'a :tada: b\n',
			'no match\n',
			'#1 and :tada:\n',
			'a :tada: b\n',
		];
		for (const doc of docs) {
			expect(session.compile(doc, options).code).toBe(
				compile(doc, options).code
			);
		}
	});
});
