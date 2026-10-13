import { rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { emoji, EmojiError } from '@mdsvex/plugin-emoji';
import type { EmojiOptions } from '@mdsvex/plugin-emoji';
import { compile, mdsvex } from 'mdsvex';
import { describe, expect, test } from 'vitest';

import { expect_parity } from '../../../packages/parse/test/plugin_harness';
import { write_app } from '../../test/app';

const HERE = dirname(fileURLToPath(import.meta.url));

const PARTY = '\u{1f389}';
const THUMB = '\u{1f44d}';
const HUNDRED = '\u{1f4af}';
const ROCKET = '\u{1f680}';
const HEART = '\u2764\ufe0f';

function html(source: string, options?: EmojiOptions): string {
	return compile(source, { plugins: [emoji(options)] }).code;
}

/** the html of one line of prose */
function line(source: string, options?: EmojiOptions): string {
	const code = html(source + '\n', options);
	return code.slice('<p>'.length, -'</p>'.length);
}

function untouched(source: string, options?: EmojiOptions): void {
	expect(html(source, options)).toBe(compile(source).code);
}

describe('shortcodes', () => {
	test('a shortcode becomes its emoji', () => {
		expect(line('We shipped :tada: today')).toBe(`We shipped ${PARTY} today`);
		expect(line(':rocket:')).toBe(ROCKET);
	});

	test('names with a plus, a minus, a digit or an underscore', () => {
		expect(line(':+1: :-1: :100: :e-mail: :1st_place_medal: :t-rex:')).toBe(
			`${THUMB} \u{1f44e} ${HUNDRED} \u{1f4e7} \u{1f947} \u{1f996}`
		);
	});

	test('two names for one emoji', () => {
		expect(line(':+1: :thumbsup:')).toBe(`${THUMB} ${THUMB}`);
	});

	test('an emoji that needs a variation selector keeps it', () => {
		expect(line(':heart:')).toBe(HEART);
	});

	test('shortcodes next to each other and next to punctuation', () => {
		expect(line(':tada::tada: (:tada:) :tada:, :tada:!')).toBe(
			`${PARTY}${PARTY} (${PARTY}) ${PARTY}, ${PARTY}!`
		);
	});

	test('a name the table does not have stays as written', () => {
		untouched('this is :not_an_emoji: and :: and : :\n');
		untouched(':Tada: and :TADA:\n');
	});

	test('the closing colon of an unknown name can open a known one', () => {
		expect(line(':nope::tada: and : :tada:')).toBe(
			`:nope:${PARTY} and : ${PARTY}`
		);
	});

	test('every shortcode in the table becomes something', () => {
		const names = ['grinning', 'zzz', 'wales', 'family_man_woman_girl_boy'];
		for (const name of names) {
			const out = line(`:${name}:`);
			expect(out, name).not.toContain(':');
			expect(out.length, name).toBeGreaterThan(0);
		}
	});
});

describe('what is not a shortcode', () => {
	test('a time or a ratio, where the colons touch digits', () => {
		untouched('at 10:30:00 the ratio was 1:100:1, then 12:00:pm\n');
		expect(line('scored :100: at 10:30')).toBe(`scored ${HUNDRED} at 10:30`);
	});

	test('a name that touches a letter on either side', () => {
		untouched('key:tada:value and std:x:y and a:+1:b\n');
		untouched('caf\u00e9:tada: and :tada:\u00e9\n');
	});

	test('an inline directive, whose name is followed by a bracket', () => {
		const directives = { strict_directives: false };
		const source = ':tada[party] and :tada: and :rocket[:tada:]\n';
		expect(compile(source, { plugins: [emoji()], ...directives }).code).toBe(
			compile(`:tada[party] and ${PARTY} and :rocket[${PARTY}]\n`, directives)
				.code
		);
	});

	test('a block directive', () => {
		const directives = { strict_directives: false };
		const source = '::tada[label :tada:]\n\n:::tada\n:tada:\n:::\n';
		expect(compile(source, { plugins: [emoji()], ...directives }).code).toBe(
			compile(`::tada[label ${PARTY}]\n\n:::tada\n${PARTY}\n:::\n`, directives)
				.code
		);
	});

	test('a shortcode the author escaped', () => {
		expect(line('\\:tada: and :tada\\: and :tada:')).toBe(
			`:tada: and :tada: and ${PARTY}`
		);
	});

	test('code, math, urls, attributes, expressions and comments', () => {
		untouched(
			[
				'`:tada:` $`:tada:`$ <code>:tada:</code> <kbd>:tada:</kbd>',
				'<https://x.io/:tada:> [x](/:tada: ":tada:") ![:tada:](/a.png)',
				'{":tada:"} <span title=":tada:">x</span> <!-- :tada: -->',
				'',
				'```',
				':tada:',
				'```',
				'',
				'<pre>',
				':tada:',
				'</pre>',
				'',
				'<script>',
				'	const a = ":tada:";',
				'</script>',
				'',
			].join('\n')
		);
	});
});

describe('where shortcodes are found', () => {
	test('headings, lists, tables, quotes, links and nested inlines', () => {
		expect(
			html(
				[
					'## Done :tada:',
					'',
					'- *one :tada:*',
					'',
					'> quote :tada:',
					'',
					'| a :tada: |',
					'| --- |',
					'',
					'[go :tada:](/u) ~~:tada:~~ <b>:tada:</b>',
					'',
				].join('\n')
			)
		).toBe(
			`<h2>Done ${PARTY}</h2>` +
				`<ul>\n<li><strong>one ${PARTY}</strong></li>\n\n</ul>` +
				`<blockquote>\n<p>quote ${PARTY}</p>\n</blockquote>` +
				`<table>\n<thead>\n<tr>\n<th>a ${PARTY}</th>\n</tr>\n</thead>\n\n</table>` +
				`<p><a href="/u">go ${PARTY}</a> <del>${PARTY}</del> <b>${PARTY}</b></p>`
		);
	});

	test('text a revoke left behind', () => {
		expect(line('*not strong :tada:')).toBe(`*not strong ${PARTY}`);
		expect(line('[not a link :tada:')).toBe(`[not a link ${PARTY}`);
	});

	test('a heading id still comes from the source', () => {
		expect(
			compile('# Done :tada:\n', { plugins: [emoji()], heading_ids: true }).code
		).toBe(`<h1 id="done-tada">Done ${PARTY}</h1>`);
	});

	test('smart punctuation still curls the text around an emoji', () => {
		expect(
			compile('"done :tada:" -- it\'s out\n', {
				plugins: [emoji()],
				smart_punctuation: true,
			}).code
		).toBe(`<p>\u201cdone ${PARTY}\u201d \u2013 it\u2019s out</p>`);
	});
});

describe('table and extend', () => {
	test('extend adds a shortcode and replaces one', () => {
		const options = { extend: { shipit: 'SHIP', tada: 'TA-DA' } };
		expect(line(':shipit: :tada: :rocket:', options)).toBe(
			`SHIP TA-DA ${ROCKET}`
		);
	});

	test('extend takes a shortcode out with null', () => {
		expect(line(':100: :tada:', { extend: { 100: null } })).toBe(
			`:100: ${PARTY}`
		);
	});

	test('table replaces the built in table', () => {
		const options = { table: { ok: 'OK' } };
		expect(line(':ok: :tada:', options)).toBe('OK :tada:');
		expect(line(':ok: :go:', { ...options, extend: { go: 'GO' } })).toBe(
			'OK GO'
		);
	});

	test('what a shortcode becomes is text, not markup', () => {
		expect(line(':x:', { table: { x: '<b>{y}</b> &amp;' } })).toBe(
			'&lt;b&gt;&#123;y&#125;&lt;/b&gt; &amp;amp;'
		);
	});

	test('a name can have capitals', () => {
		expect(line(':LGTM: :lgtm:', { extend: { LGTM: 'ok' } })).toBe('ok :lgtm:');
	});
});

describe('label', () => {
	const span = (label: string, emoji: string) =>
		`<span role="img" aria-label="${label}">${emoji}</span>`;

	test('wraps an emoji with its description', () => {
		expect(line('done :tada: :+1:', { label: true })).toBe(
			`done ${span('party popper', PARTY)} ${span('thumbs up', THUMB)}`
		);
	});

	test('wraps an emoji typed as a character', () => {
		expect(line(`done ${PARTY} and ${HEART}`, { label: true })).toBe(
			`done ${span('party popper', PARTY)} and ${span('red heart', HEART)}`
		);
	});

	test('names a skin tone variant after its emoji', () => {
		const dark = `${THUMB}\u{1f3ff}`;
		expect(line(dark, { label: true })).toBe(span('thumbs up', dark));
	});

	test('leaves a typed emoji it has no name for as it was', () => {
		const flag = '\u{1f3f4}\u200d\u2620\ufe0f';
		expect(line(`${flag} x`, { label: () => undefined })).toBe(`${flag} x`);
	});

	test('names a shortcode of the caller after the shortcode', () => {
		expect(line(':ship_it:', { label: true, extend: { ship_it: 'S' } })).toBe(
			span('ship it', 'S')
		);
	});

	test('takes a function, called with the emoji and the shortcode', () => {
		const seen: [string, string | undefined][] = [];
		const options: EmojiOptions = {
			label(emoji, name) {
				seen.push([emoji, name]);
				return name === 'tada' ? 'hooray' : undefined;
			},
		};
		expect(line(`:tada: :rocket: ${THUMB}`, options)).toBe(
			`${span('hooray', PARTY)} ${ROCKET} ${THUMB}`
		);
		expect(seen).toEqual([
			[PARTY, 'tada'],
			[ROCKET, 'rocket'],
			[THUMB, undefined],
		]);
	});

	test('a label is an attribute value', () => {
		expect(line(':tada:', { label: () => 'a "b" & <c>' })).toBe(
			`<span role="img" aria-label="a &quot;b&quot; &amp; &lt;c&gt;">${PARTY}</span>`
		);
	});

	test('false is off', () => {
		expect(line(':tada:', { label: false })).toBe(PARTY);
	});
});

describe('attrs', () => {
	test('wraps each emoji in a span with the attributes', () => {
		expect(line(`:tada: ${THUMB}`, { attrs: { class: 'emoji' } })).toBe(
			`<span class="emoji">${PARTY}</span> <span class="emoji">${THUMB}</span>`
		);
	});

	test('goes with a label and replaces a default of the same name', () => {
		expect(
			line(':tada:', {
				label: true,
				attrs: { class: 'emoji', role: 'presentation' },
			})
		).toBe(
			`<span role="presentation" aria-label="party popper" class="emoji">${PARTY}</span>`
		);
	});
});

describe('options', () => {
	test('a table or an extend that is no object of shortcodes throws', () => {
		expect(() => emoji({ table: [] as any })).toThrow(EmojiError);
		expect(() => emoji({ table: null as any })).toThrow(
			'[@mdsvex/plugin-emoji] table must be an object of shortcodes, got null'
		);
		expect(() => emoji({ extend: 'x' as any })).toThrow(EmojiError);
	});

	test('a shortcode written with its colons or a space throws', () => {
		expect(() => emoji({ extend: { ':tada:': 'x' } })).toThrow(
			'[@mdsvex/plugin-emoji] extend has the shortcode ":tada:", a shortcode is letters, digits, _, + and -, without its colons'
		);
		expect(() => emoji({ table: { 'two words': 'x' } })).toThrow(EmojiError);
	});

	test('a shortcode that becomes nothing throws', () => {
		expect(() => emoji({ table: { x: '' } })).toThrow(EmojiError);
		expect(() => emoji({ table: { x: 1 as any } })).toThrow(EmojiError);
		expect(() => emoji({ table: { x: null as any } })).toThrow(EmojiError);
		expect(() => emoji({ extend: { x: '' } })).toThrow(EmojiError);
	});

	test('a label or attrs of the wrong type throws', () => {
		expect(() => emoji({ label: 'yes' as any })).toThrow(EmojiError);
		expect(() => emoji({ attrs: 'emoji' as any })).toThrow(EmojiError);
		try {
			emoji({ label: 1 as any });
		} catch (error) {
			expect((error as EmojiError).code).toBe('option');
			expect((error as EmojiError).name).toBe('EmojiError');
		}
	});
});

describe('tree', () => {
	/** every parser path builds one tree */
	function tree(source: string, options?: EmojiOptions): unknown {
		return expect_parity(source, () => [emoji(options).parse!], {
			attrs: ['tag', 'attributes'],
		});
	}

	test('a shortcode is replaced in the run it is in', () => {
		expect(tree('a :tada: b *c :+1:*\n')).toEqual([
			'root',
			[
				'paragraph',
				`text:a ${PARTY} b `,
				['strong_emphasis', `text:c ${THUMB}`],
			],
		]);
	});

	test('a label splits the text around a span', () => {
		expect(tree('a :tada: b\n', { label: true })).toEqual([
			'root',
			[
				'paragraph',
				'text:a ',
				[
					'html tag="span" attributes={"role":"img","aria-label":"party popper"}',
					`text:${PARTY}`,
				],
				'text: b',
			],
		]);
	});

	test('escapes, times and text a revoke left are the same on every path', () => {
		expect(
			tree('\\:tada: 10:30:00 _x :tada: [y :100:\n\n- :tada:\n- 1:100:1\n')
		).toEqual([
			'root',
			['paragraph', `text::tada: 10:30:00 _x ${PARTY} [y ${HUNDRED}`],
			['list', ['list_item', `text:${PARTY}`], ['list_item', 'text:1:100:1']],
		]);
	});
});

describe('vite plugin', () => {
	test('the plugins option takes it', async () => {
		const [plugin] = mdsvex({ plugins: [emoji({ label: true })] });
		const transform = plugin.transform as Function;
		const result = await transform.call(
			{ addWatchFile() {} },
			'Shipped :tada:\n',
			'/app/src/doc.svx'
		);
		expect(result.code).toContain(
			`Shipped <span role="img" aria-label="party popper">${PARTY}</span>`
		);
	});
});

describe('as published', () => {
	test('the files it publishes are the ones its exports name', async () => {
		const root = write_app(HERE, {}, [dirname(HERE)]);
		try {
			const entry = createRequire(join(root, 'index.js')).resolve(
				'@mdsvex/plugin-emoji'
			);
			expect(entry).toBe(
				join(
					root,
					'node_modules',
					'@mdsvex',
					'plugin-emoji',
					'dist',
					'index.js'
				)
			);
			const installed = await import(pathToFileURL(entry).href);
			expect(compile(':tada:', { plugins: [installed.emoji()] }).code).toBe(
				`<p>${PARTY}</p>`
			);
			expect(statSync(entry).size).toBeLessThan(80_000);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
