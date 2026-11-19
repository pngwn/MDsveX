import { rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { anchors } from '@mdsvex/plugin-anchors';
import { emoji } from '@mdsvex/plugin-emoji';
import { external_links } from '@mdsvex/plugin-external-links';
import { references, ReferencesError } from '@mdsvex/plugin-references';
import type { ReferencesOptions } from '@mdsvex/plugin-references';
import { compile, mdsvex } from 'mdsvex';
import { describe, expect, test } from 'vitest';

import { expect_parity } from '../../../packages/parse/test/plugin_harness';
import { write_app } from '../../test/app';

const HERE = dirname(fileURLToPath(import.meta.url));

const REPO = { repo: 'sveltejs/svelte' };
const GH = 'https://github.com';

function html(source: string, options: ReferencesOptions = REPO): string {
	return compile(source, { plugins: [references(options)] }).code;
}

/** the html of one line of prose */
function line(source: string, options?: ReferencesOptions): string {
	const code = html(source + '\n', options);
	return code.slice('<p>'.length, -'</p>'.length);
}

function untouched(source: string, options: ReferencesOptions = REPO): void {
	expect(html(source, options)).toBe(compile(source).code);
}

const a = (href: string, text: string) => `<a href="${href}">${text}</a>`;

describe('mentions', () => {
	test('a user becomes a link to their page', () => {
		expect(line('thanks @ada and @Rich-Harris!')).toBe(
			`thanks ${a(`${GH}/ada`, '@ada')} and ${a(`${GH}/Rich-Harris`, '@Rich-Harris')}!`
		);
	});

	test('at the start, in brackets and before punctuation', () => {
		expect(line("@ada (@bob), @cy's @dee.")).toBe(
			`${a(`${GH}/ada`, '@ada')} (${a(`${GH}/bob`, '@bob')}), ${a(`${GH}/cy`, '@cy')}'s ${a(`${GH}/dee`, '@dee')}.`
		);
	});

	test('a name ends before a hyphen that ends it', () => {
		expect(line('@ada- and @a-b-')).toBe(
			`${a(`${GH}/ada`, '@ada')}- and ${a(`${GH}/a-b`, '@a-b')}-`
		);
	});

	test('an email address is not a mention', () => {
		untouched('write to me@example.com or first.last+tag@mail.example.org\n');
	});

	test('what is not a user name is left alone', () => {
		untouched('@ alone, a@b, @-x, @user_name, @org/team, x@y and @@\n');
	});

	test('needs no repo', () => {
		expect(line('@ada', {})).toBe(a(`${GH}/ada`, '@ada'));
	});
});

describe('issues', () => {
	test('a number becomes a link to the issue in the repo', () => {
		expect(line('fixed in #123, see #4.')).toBe(
			`fixed in ${a(`${GH}/sveltejs/svelte/issues/123`, '#123')}, see ${a(`${GH}/sveltejs/svelte/issues/4`, '#4')}.`
		);
	});

	test('with an owner and a name it goes to that repo', () => {
		expect(line('see pngwn/MDsveX#12 and sveltejs/kit.svelte.dev#3')).toBe(
			`see ${a(`${GH}/pngwn/MDsveX/issues/12`, 'pngwn/MDsveX#12')} and ${a(`${GH}/sveltejs/kit.svelte.dev/issues/3`, 'sveltejs/kit.svelte.dev#3')}`
		);
	});

	test('without a repo only the full form is a link', () => {
		expect(line('#123 and pngwn/MDsveX#12', {})).toBe(
			`#123 and ${a(`${GH}/pngwn/MDsveX/issues/12`, 'pngwn/MDsveX#12')}`
		);
	});

	test('what is not an issue is left alone', () => {
		untouched(
			'# is a hash, #abc, #12abc, abc#12, a/#12, #1.5, ##12 and a numeric reference &#35;\n'
		);
	});

	test('a heading marker is not an issue, a number in a heading is', () => {
		expect(html('## About #12\n')).toBe(
			`<h2>About ${a(`${GH}/sveltejs/svelte/issues/12`, '#12')}</h2>`
		);
	});
});

describe('commits', () => {
	const sha = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';

	test('a full or a short hash becomes a link, shown short', () => {
		expect(line(`fixed in ${sha} and a1b2c3d`)).toBe(
			`fixed in ${a(`${GH}/sveltejs/svelte/commit/${sha}`, '<code>a1b2c3d</code>')} and ${a(`${GH}/sveltejs/svelte/commit/a1b2c3d`, '<code>a1b2c3d</code>')}`
		);
	});

	test('a word, a number and a hash that is part of something else are left alone', () => {
		untouched(
			'defaced decade 1234567 abcdefg 12345 a1b2c3 A1B2C3D v1.a1b2c3d x-a1b2c3d a1b2c3dz\n'
		);
	});

	test('needs a repo', () => {
		untouched('a1b2c3d\n', {});
	});
});

describe('linkify', () => {
	const on = { ...REPO, linkify: true };

	test('is off unless asked for', () => {
		untouched('see https://example.com and www.example.com\n');
	});

	test('a bare url becomes a link to itself', () => {
		expect(line('see https://example.com/a?b=1#c and http://x.io', on)).toBe(
			`see ${a('https://example.com/a?b=1#c', 'https://example.com/a?b=1#c')} and ${a('http://x.io', 'http://x.io')}`
		);
	});

	test('a www address gets https', () => {
		expect(line('at www.example.com/docs', on)).toBe(
			`at ${a('https://www.example.com/docs', 'www.example.com/docs')}`
		);
	});

	test('punctuation at the end belongs to the sentence', () => {
		expect(
			line('Is it https://x.io/a? Yes, https://x.io/b. (https://x.io/c)', on)
		).toBe(
			`Is it ${a('https://x.io/a', 'https://x.io/a')}? Yes, ${a('https://x.io/b', 'https://x.io/b')}. (${a('https://x.io/c', 'https://x.io/c')})`
		);
	});

	test('a bracket the url opened stays in it', () => {
		const url = 'https://en.wikipedia.org/wiki/Svelte_(framework)';
		expect(line(`(${url})`, on)).toBe(`(${a(url, url)})`);
	});

	test('characters markdown reads, an underscore, a star, a tilde, stay in the url', () => {
		const url = 'https://x.io/a_b_c/~d/*e';
		expect(line(`go ${url} now`, on)).toBe(`go ${a(url, url)} now`);
	});

	test('a url that holds emphasis the parser closed is cut at it', () => {
		expect(line('go https://x.io/*a*/b now', on)).toBe(
			`go ${a('https://x.io/', 'https://x.io/')}<strong>a</strong>/b now`
		);
	});

	test('an ampersand is escaped once, written bare or as a reference', () => {
		const want = a('https://x.io/?a=1&amp;b=2', 'https://x.io/?a=1&amp;b=2');
		expect(line('https://x.io/?a=1&b=2', on)).toBe(want);
		expect(line('https://x.io/?a=1&amp;b=2', on)).toBe(want);
	});

	test('a reference at the end of a url is not part of it', () => {
		expect(line('https://x.io/a&copy; x', on)).toBe(
			`${a('https://x.io/a', 'https://x.io/a')}&copy; x`
		);
	});

	test('a url ends at an expression, which is not text', () => {
		expect(line('https://x.io/{slug}', on)).toBe(
			`${a('https://x.io/', 'https://x.io/')}{slug}`
		);
	});

	test('nothing in a url is a mention, an issue or a commit', () => {
		const url = 'https://x.io/@ada/issues#12/a1b2c3d';
		expect(line(url, on)).toBe(a(url, url));
		untouched(`${url}\n`);
	});

	test('what is not a url is left alone', () => {
		untouched(
			'www. and www.x and http:// and https://. and ftp://x.io and xhttps://x.io and a.www.x.io\n',
			on
		);
	});

	test('an email address is left alone', () => {
		untouched('me@www.example.com and me@example.com\n', on);
	});
});

describe('what is never touched', () => {
	test('the text of a link, of an autolink and of a typed anchor', () => {
		untouched(
			'[see @ada and #12](/x) <https://x.io/@ada> <a href="/y">@ada #12 https://x.io</a> [*@ada*](/z)\n',
			{ ...REPO, linkify: true }
		);
	});

	test('code, math, attributes, expressions and comments', () => {
		untouched(
			[
				'`@ada #12` $`@ada`$ <code>@ada #12</code> <kbd>#12</kbd>',
				'![@ada #12](/a.png "@ada") [x](/u "#12")',
				'{"@ada"} <span title="@ada #12">x</span> <!-- @ada #12 -->',
				'',
				'```',
				'@ada #12 https://x.io a1b2c3d',
				'```',
				'',
				'<pre>',
				'@ada #12',
				'</pre>',
				'',
			].join('\n'),
			{ ...REPO, linkify: true }
		);
	});

	test('a reference the author escaped', () => {
		expect(line('\\@ada and \\#12 and @bob')).toBe(
			`@ada and #12 and ${a(`${GH}/bob`, '@bob')}`
		);
	});
});

describe('where references are found', () => {
	test('lists, tables, quotes and nested inlines', () => {
		const ada = a(`${GH}/ada`, '@ada');
		expect(
			html(
				[
					'- *@ada*',
					'',
					'> @ada',
					'',
					'| @ada |',
					'| --- |',
					'',
					'~~@ada~~ <b>@ada</b>',
					'',
				].join('\n')
			)
		).toBe(
			`<ul>\n<li><strong>${ada}</strong></li>\n\n</ul>` +
				`<blockquote>\n<p>${ada}</p>\n</blockquote>` +
				`<table>\n<thead>\n<tr>\n<th>${ada}</th>\n</tr>\n</thead>\n\n</table>` +
				`<p><del>${ada}</del> <b>${ada}</b></p>`
		);
	});

	test('text a revoke left behind', () => {
		expect(line('*not strong @ada')).toBe(
			`*not strong ${a(`${GH}/ada`, '@ada')}`
		);
		expect(line('[not a link #12')).toBe(
			`[not a link ${a(`${GH}/sveltejs/svelte/issues/12`, '#12')}`
		);
	});
});

describe('templates', () => {
	test('a string with placeholders', () => {
		const options: ReferencesOptions = {
			repo: 'group/project',
			mention: 'https://gitlab.com/{user}',
			issue: 'https://gitlab.com/{owner}/{name}/-/issues/{number}',
			commit: 'https://gitlab.com/{repo}/-/commit/{sha}',
		};
		expect(line('@ada #7 other/thing#8 a1b2c3d', options)).toBe(
			[
				a('https://gitlab.com/ada', '@ada'),
				a('https://gitlab.com/group/project/-/issues/7', '#7'),
				a('https://gitlab.com/other/thing/-/issues/8', 'other/thing#8'),
				a(
					'https://gitlab.com/group/project/-/commit/a1b2c3d',
					'<code>a1b2c3d</code>'
				),
			].join(' ')
		);
	});

	test('a function, which leaves a reference as text when it returns nothing', () => {
		const seen: unknown[] = [];
		const options: ReferencesOptions = {
			...REPO,
			mention(parts) {
				seen.push(parts);
				return parts.user === 'ada' ? '/team/ada' : undefined;
			},
			issue(parts) {
				seen.push(parts);
				return `/i/${parts.number}`;
			},
		};
		expect(line('@ada @bob #5', options)).toBe(
			`${a('/team/ada', '@ada')} @bob ${a('/i/5', '#5')}`
		);
		expect(seen).toEqual([
			{ user: 'ada' },
			{ user: 'bob' },
			{
				repo: 'sveltejs/svelte',
				owner: 'sveltejs',
				name: 'svelte',
				number: '5',
			},
		]);
	});

	test('false turns one kind off', () => {
		expect(line('@ada #5 a1b2c3d', { ...REPO, mention: false })).toBe(
			`@ada ${a(`${GH}/sveltejs/svelte/issues/5`, '#5')} ${a(`${GH}/sveltejs/svelte/commit/a1b2c3d`, '<code>a1b2c3d</code>')}`
		);
		untouched('@ada #5 x/y#6 a1b2c3d\n', {
			...REPO,
			mention: false,
			issue: false,
			commit: false,
		});
	});

	test('the url a template gives is escaped as an attribute', () => {
		expect(line('@ada', { mention: '/u?n={user}&x="y"' })).toBe(
			a('/u?n=ada&amp;x=&quot;y&quot;', '@ada')
		);
	});
});

describe('attrs', () => {
	test('an object goes on every link', () => {
		expect(line('@ada #5', { ...REPO, attrs: { class: 'ref' } })).toBe(
			`<a href="${GH}/ada" class="ref">@ada</a> <a href="${GH}/sveltejs/svelte/issues/5" class="ref">#5</a>`
		);
	});

	test('a function gives them by kind', () => {
		const kinds: string[] = [];
		const options: ReferencesOptions = {
			...REPO,
			linkify: true,
			attrs(kind) {
				kinds.push(kind);
				return kind === 'mention' ? { class: 'mention' } : undefined;
			},
		};
		expect(line('@ada #5 a1b2c3d https://x.io', options)).toBe(
			[
				`<a href="${GH}/ada" class="mention">@ada</a>`,
				a(`${GH}/sveltejs/svelte/issues/5`, '#5'),
				a(`${GH}/sveltejs/svelte/commit/a1b2c3d`, '<code>a1b2c3d</code>'),
				a('https://x.io', 'https://x.io'),
			].join(' ')
		);
		expect(kinds).toEqual(['mention', 'issue', 'commit', 'url']);
	});

	test('cannot replace the href', () => {
		expect(line('@ada', { attrs: { href: '/no' } })).toBe(
			a(`${GH}/ada`, '@ada')
		);
	});
});

describe('options', () => {
	test('a repo that is not owner/name throws', () => {
		for (const repo of ['svelte', 'a/b/c', '/b', 'a/', '', 5 as any]) {
			expect(() => references({ repo }), String(repo)).toThrow(ReferencesError);
		}
		expect(() => references({ repo: 'svelte' })).toThrow(
			'[@mdsvex/plugin-references] repo must be written owner/name, got "svelte"'
		);
	});

	test('a template with a placeholder it does not take throws', () => {
		expect(() => references({ mention: '/u/{name}' })).toThrow(
			'[@mdsvex/plugin-references] mention has the placeholder {name}, it takes {user}'
		);
		expect(() => references({ issue: '/i/{id}' })).toThrow(ReferencesError);
		expect(() => references({ commit: '/c/{number}' })).toThrow(
			ReferencesError
		);
	});

	test('a template, linkify or attrs of the wrong type throws', () => {
		expect(() => references({ mention: 5 as any })).toThrow(ReferencesError);
		expect(() => references({ issue: null as any })).toThrow(ReferencesError);
		expect(() => references({ linkify: 'yes' as any })).toThrow(
			ReferencesError
		);
		expect(() => references({ attrs: 'ref' as any })).toThrow(ReferencesError);
		try {
			references({ linkify: 1 as any });
		} catch (error) {
			expect((error as ReferencesError).code).toBe('option');
			expect((error as ReferencesError).name).toBe('ReferencesError');
		}
	});
});

describe('with other plugins', () => {
	test('emoji after it leaves a shortcode in a url alone', () => {
		const source = 'see https://x.io/:tada:/ :tada: @ada\n';
		expect(
			compile(source, {
				plugins: [references({ linkify: true }), emoji()],
			}).code
		).toBe(
			`<p>see ${a('https://x.io/:tada:/', 'https://x.io/:tada:/')} \u{1f389} ${a(`${GH}/ada`, '@ada')}</p>`
		);
	});

	test('external links, which reads links during the parse, does not see the ones made here', () => {
		for (const plugins of [
			[references(), external_links()],
			[external_links(), references()],
		]) {
			expect(compile('@ada [x](https://x.io)\n', { plugins }).code).toBe(
				`<p>${a(`${GH}/ada`, '@ada')} <a href="https://x.io" rel="noopener noreferrer">x</a></p>`
			);
		}
		expect(
			compile('@ada\n', {
				plugins: [references({ attrs: { rel: 'noopener noreferrer' } })],
			}).code
		).toBe(`<p><a href="${GH}/ada" rel="noopener noreferrer">@ada</a></p>`);
	});

	test('a heading that anchors wrapped in a link gets no references', () => {
		const source = '## Thanks @ada\n\n@ada\n';
		const options = { heading_ids: true };
		expect(
			compile(source, { ...options, plugins: [anchors(), references()] }).code
		).toBe(
			`<h2 id="thanks-ada"><a href="#thanks-ada">Thanks @ada</a></h2><p>${a(`${GH}/ada`, '@ada')}</p>`
		);
		expect(
			compile(source, { ...options, plugins: [references(), anchors()] }).code
		).toBe(
			`<h2 id="thanks-ada">Thanks ${a(`${GH}/ada`, '@ada')}</h2><p>${a(`${GH}/ada`, '@ada')}</p>`
		);
	});
});

describe('tree', () => {
	/** every parser path builds one tree */
	function tree(source: string, options: ReferencesOptions = REPO): unknown {
		return expect_parity(source, () => [references(options).parse!], {
			attrs: ['href', 'tag'],
		});
	}

	test('a reference splits the text around a link', () => {
		expect(tree('ask @ada about #12\n')).toEqual([
			'root',
			[
				'paragraph',
				'text:ask ',
				[`link href="${GH}/ada"`, 'text:@ada'],
				'text: about ',
				[`link href="${GH}/sveltejs/svelte/issues/12"`, 'text:#12'],
			],
		]);
	});

	test('a commit is a link around a code element', () => {
		expect(tree('at a1b2c3d\n')).toEqual([
			'root',
			[
				'paragraph',
				'text:at ',
				[
					`link href="${GH}/sveltejs/svelte/commit/a1b2c3d"`,
					['html tag="code"', 'text:a1b2c3d'],
				],
			],
		]);
	});

	test('urls, escapes and text a revoke left are the same on every path', () => {
		expect(
			tree(
				'\\@ada me@x.io _x https://x.io/a_b_c. [y #12\n\n- @ada\n- x/y#3\n',
				{ ...REPO, linkify: true }
			)
		).toEqual([
			'root',
			[
				'paragraph',
				'text:@ada me@x.io _x ',
				['link href="https://x.io/a_b_c"', 'text:https://x.io/a_b_c'],
				'text:. [y ',
				[`link href="${GH}/sveltejs/svelte/issues/12"`, 'text:#12'],
			],
			[
				'list',
				['list_item', [`link href="${GH}/ada"`, 'text:@ada']],
				['list_item', [`link href="${GH}/x/y/issues/3"`, 'text:x/y#3']],
			],
		]);
	});
});

describe('vite plugin', () => {
	test('the plugins option takes it', async () => {
		const [plugin] = mdsvex({ plugins: [references(REPO)] });
		const transform = plugin.transform as Function;
		const result = await transform.call(
			{ addWatchFile() {} },
			'thanks @ada for #12\n',
			'/app/src/doc.svx'
		);
		expect(result.code).toContain(
			`thanks ${a(`${GH}/ada`, '@ada')} for ${a(`${GH}/sveltejs/svelte/issues/12`, '#12')}`
		);
	});
});

describe('as published', () => {
	test('the files it publishes are the ones its exports name', async () => {
		const root = write_app(HERE, {}, [dirname(HERE)]);
		try {
			const entry = createRequire(join(root, 'index.js')).resolve(
				'@mdsvex/plugin-references'
			);
			expect(entry).toBe(
				join(
					root,
					'node_modules',
					'@mdsvex',
					'plugin-references',
					'dist',
					'index.js'
				)
			);
			const installed = await import(pathToFileURL(entry).href);
			expect(compile('@ada', { plugins: [installed.references()] }).code).toBe(
				`<p>${a(`${GH}/ada`, '@ada')}</p>`
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
