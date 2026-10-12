import { rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { anchors } from '@mdsvex/plugin-anchors';
import { external_links } from '@mdsvex/plugin-external-links';
import type { ExternalLinksOptions } from '@mdsvex/plugin-external-links';
import { steps } from '@mdsvex/plugin-steps';
import { compile, mdsvex } from 'mdsvex';
import type { Bundle } from 'mdsvex';
import { describe, expect, test } from 'vitest';

import { expect_parity } from '../../../packages/parse/test/plugin_harness';
import { write_app } from '../../test/app';

const HERE = dirname(fileURLToPath(import.meta.url));

const REL = 'rel="noopener noreferrer"';

function html(source: string, options?: ExternalLinksOptions): string {
	return compile(source, { plugins: [external_links(options)] }).code;
}

/** the html of one link written in a paragraph */
function link(href: string, options?: ExternalLinksOptions): string {
	const code = html(`[x](${href})`, options);
	return code.slice('<p>'.length, -'</p>'.length);
}

function untouched(href: string, options?: ExternalLinksOptions): void {
	const source = `[x](${href})`;
	expect(html(source, options)).toBe(compile(source).code);
}

describe('which links are external', () => {
	test('an absolute http or https url', () => {
		expect(link('https://example.com/a?b#c')).toBe(
			`<a href="https://example.com/a?b#c" ${REL}>x</a>`
		);
		expect(link('http://example.com')).toBe(
			`<a href="http://example.com" ${REL}>x</a>`
		);
		expect(link('HTTPS://EXAMPLE.COM')).toBe(
			`<a href="HTTPS://EXAMPLE.COM" ${REL}>x</a>`
		);
	});

	test('a protocol relative url', () => {
		expect(link('//cdn.example.com/x.js')).toBe(
			`<a href="//cdn.example.com/x.js" ${REL}>x</a>`
		);
	});

	test('an autolink', () => {
		expect(html('<https://example.com>')).toBe(
			`<p><a href="https://example.com" ${REL}>https://example.com</a></p>`
		);
	});

	test('a link with a title keeps it', () => {
		expect(html('[x](https://example.com "Title")')).toBe(
			`<p><a href="https://example.com" title="Title" ${REL}>x</a></p>`
		);
	});

	test('relative urls, fragments and other schemes are left alone', () => {
		for (const href of [
			'/docs',
			'./guide.md',
			'../up',
			'guide',
			'#section',
			'?query',
			'mailto:a@example.com',
			'tel:+123',
			'ftp://example.com/file',
			'javascript:void',
			'https://',
		]) {
			untouched(href);
		}
		expect(html('<mailto:a@example.com>')).toBe(
			compile('<mailto:a@example.com>').code
		);
	});

	test('a url whose host comes from an expression is left alone', () => {
		for (const href of [
			'{url}',
			'{base}/docs',
			'https://{host}/docs',
			'https://example.com{rest}',
			'//{host}/x',
		]) {
			untouched(href);
		}
	});

	test('an expression after the host does not hide where the link goes', () => {
		expect(link('https://example.com/{slug}?q={q}')).toBe(
			`<a href="https://example.com/{slug}?q={q}" ${REL}>x</a>`
		);
	});

	test('a link the parser gave up on is text', () => {
		const source =
			'a [broken](https://example.com and [ok](https://example.com)';
		expect(html(source)).toBe(
			`<p>a [broken](https://example.com and <a href="https://example.com" ${REL}>ok</a></p>`
		);
	});

	test('a typed anchor is not a markdown link', () => {
		untouched('/x) <a href="https://example.com">typed</a> [y](/y');
	});

	test('links in headings, lists, tables, quotes and nested inlines', () => {
		const a = `<a href="https://example.com" ${REL}>`;
		expect(
			html(
				[
					'## A [h](https://example.com)',
					'',
					'- *[l](https://example.com)*',
					'',
					'> [q](https://example.com)',
					'',
					'| [t](https://example.com) |',
					'| --- |',
					'',
				].join('\n')
			)
		).toBe(
			`<h2>A ${a}h</a></h2>` +
				`<ul>\n<li><strong>${a}l</a></strong></li>\n\n</ul>` +
				`<blockquote>\n<p>${a}q</a></p>\n</blockquote>` +
				`<table>\n<thead>\n<tr>\n<th>${a}t</a></th>\n</tr>\n</thead>\n\n</table>`
		);
	});
});

describe('internal_hosts', () => {
	const options = { internal_hosts: ['example.com', 'Docs.Example.com:8080'] };

	test('a link to a listed host is left alone, with any port, userinfo or case', () => {
		for (const href of [
			'https://example.com/a',
			'http://EXAMPLE.com',
			'//example.com/x',
			'https://example.com:443/a',
			'https://user:pass@example.com/a',
			'https://docs.example.com',
		]) {
			untouched(href, options);
		}
	});

	test('another host is external, a subdomain included', () => {
		for (const href of [
			'https://www.example.com',
			'https://example.com.evil.test',
			'https://evil.test/example.com',
			'https://example.com@evil.test',
			'https:\\\\evil.test',
			'https:/evil.test',
		]) {
			expect(link(href, options)).toContain(REL);
		}
	});

	test('an ipv6 host is compared without its port', () => {
		untouched('http://[::1]:3000/x', { internal_hosts: ['[::1]'] });
		expect(
			link('http://[::2]:3000/x', { internal_hosts: ['[::1]'] })
		).toContain(REL);
	});
});

describe('is_external', () => {
	test('it decides in place of the built in test and gets its answer', () => {
		const seen: [string, boolean][] = [];
		const options: ExternalLinksOptions = {
			is_external(href, external) {
				seen.push([href, external]);
				return external ? !href.includes('partner') : href.endsWith('.pdf');
			},
		};
		expect(
			html(
				'[a](https://example.com) [b](https://partner.example) [c](/file.pdf) [d](/page) [e]({url})',
				options
			)
		).toBe(
			`<p><a href="https://example.com" ${REL}>a</a> ` +
				'<a href="https://partner.example">b</a> ' +
				`<a href="/file.pdf" ${REL}>c</a> ` +
				'<a href="/page">d</a> ' +
				'<a href="{url}">e</a></p>'
		);
		expect(seen).toEqual([
			['https://example.com', true],
			['https://partner.example', true],
			['/file.pdf', false],
			['/page', false],
			['{url}', false],
		]);
	});
});

describe('rel and target', () => {
	test('target is set when asked for', () => {
		expect(link('https://example.com', { target: '_blank' })).toBe(
			`<a href="https://example.com" ${REL} target="_blank">x</a>`
		);
	});

	test('rel takes a string or a list, and none at all', () => {
		expect(link('https://example.com', { rel: 'nofollow  ugc' })).toBe(
			'<a href="https://example.com" rel="nofollow ugc">x</a>'
		);
		expect(link('https://example.com', { rel: ['NoFollow', 'noopener'] })).toBe(
			'<a href="https://example.com" rel="nofollow noopener">x</a>'
		);
		expect(link('https://example.com', { rel: [], target: '_blank' })).toBe(
			'<a href="https://example.com" target="_blank">x</a>'
		);
	});

	test('rel is added to what the link has, a target it has stays', () => {
		const earlier = {
			link: {
				parse(node: { attrs: Record<string, unknown> }) {
					return () => {
						node.attrs.rel = 'me NoOpener';
						node.attrs.target = 'docs';
					};
				},
			},
		};
		expect(
			compile('[x](https://example.com)', {
				plugins: [external_links({ target: '_blank' })],
				parse_plugins: [earlier],
			}).code
		).toBe(
			'<p><a href="https://example.com" rel="me NoOpener noreferrer" target="docs">x</a></p>'
		);
	});

	test('attrs are added to an external link, one named like another replaces it', () => {
		expect(
			link('https://example.com', {
				attrs: { class: 'external', rel: 'external' },
			})
		).toBe(
			'<a href="https://example.com" rel="external" class="external">x</a>'
		);
		untouched('/docs', { attrs: { class: 'external' } });
	});
});

describe('icon and new_tab_label', () => {
	test('icon appends an empty hidden span after the content', () => {
		expect(link('https://example.com', { icon: true })).toBe(
			`<a href="https://example.com" ${REL}>x` +
				'<span class="external-link-icon" aria-hidden="true"></span></a>'
		);
		expect(
			html('[a *b* `c`](https://example.com)', { icon: { class: 'out' } })
		).toBe(
			`<p><a href="https://example.com" ${REL}>a <strong>b</strong> <code>c</code>` +
				'<span class="out" aria-hidden="true"></span></a></p>'
		);
	});

	test('new_tab_label names a span a screen reader reads out', () => {
		expect(
			link('https://example.com', {
				target: '_blank',
				new_tab_label: 'opens in a new tab',
			})
		).toBe(
			`<a href="https://example.com" ${REL} target="_blank">x` +
				'<span role="img" aria-label="opens in a new tab"></span></a>'
		);
	});

	test('with both the icon is the span that is read out', () => {
		expect(
			html('<https://example.com>', {
				target: '_blank',
				icon: true,
				new_tab_label: 'opens in a "new" tab',
			})
		).toBe(
			`<p><a href="https://example.com" ${REL} target="_blank">https://example.com` +
				'<span class="external-link-icon" role="img" aria-label="opens in a &quot;new&quot; tab"></span></a></p>'
		);
	});

	test('a link that stays on the site gets neither', () => {
		untouched('/docs', {
			target: '_blank',
			icon: true,
			new_tab_label: 'opens in a new tab',
		});
	});
});

describe('options', () => {
	test('a new_tab_label without a target that opens a tab throws', () => {
		const message =
			"[@mdsvex/plugin-external-links] new_tab_label needs a target that opens a new tab, such as '_blank'";
		expect(() => external_links({ new_tab_label: 'new tab' })).toThrow(message);
		expect(() =>
			external_links({ target: '_self', new_tab_label: 'new tab' })
		).toThrow(message);
		expect(() =>
			external_links({ target: 'docs', new_tab_label: 'new tab' })
		).not.toThrow();
	});

	test('options of the wrong type throw when the plugin is made', () => {
		expect(() => external_links({ target: '' })).toThrow(
			'[@mdsvex/plugin-external-links] target must be a string that is not empty'
		);
		expect(() => external_links({ rel: [1] as any })).toThrow(
			'[@mdsvex/plugin-external-links] rel must be a string or a list of strings'
		);
		expect(() => external_links({ internal_hosts: 5 as any })).toThrow(
			'[@mdsvex/plugin-external-links] internal_hosts must be a string or a list of strings'
		);
		expect(() => external_links({ is_external: 'yes' as any })).toThrow(
			'[@mdsvex/plugin-external-links] is_external must be a function'
		);
		expect(() =>
			external_links({ target: '_blank', new_tab_label: '' })
		).toThrow(
			'[@mdsvex/plugin-external-links] new_tab_label must be a string that is not empty'
		);
	});

	test('one plugin serves many documents', () => {
		const plugins = [external_links({ icon: true })];
		const first = compile('[a](https://a.example)', { plugins }).code;
		expect(compile('[a](https://a.example)', { plugins }).code).toBe(first);
		expect(compile('[b](/b)', { plugins }).code).toBe(
			'<p><a href="/b">b</a></p>'
		);
	});
});

describe('with other plugins', () => {
	const SOURCE = [
		'## Read [the spec](https://example.com/spec)',
		'',
		'## Plain',
		'',
		':::steps',
		'### Install',
		'',
		'See [npm](https://npmjs.com) and [local](/docs).',
		':::',
		'',
	].join('\n');

	function with_plugins(plugins: Bundle[]): string {
		return compile(SOURCE, { heading_ids: true, plugins }).code.replace(
			/^<script>[^]*?<\/script>/,
			''
		);
	}

	test('anchors and steps in any order give the same page', () => {
		const links = () => external_links({ target: '_blank' });
		const expected = with_plugins([links(), anchors(), steps()]);
		expect(expected).toBe(
			'<h2 id="read-the-spec">Read ' +
				`<a href="https://example.com/spec" ${REL} target="_blank">the spec</a></h2>` +
				'<h2 id="plain"><a href="#plain">Plain</a></h2>' +
				'<Steps_MDSVEX_D_G>\n' +
				'<Step_MDSVEX_D_G>{#snippet label()}' +
				'<h3 id="install"><a href="#install">Install</a></h3>{/snippet}\n' +
				`<p>See <a href="https://npmjs.com" ${REL} target="_blank">npm</a>` +
				' and <a href="/docs">local</a>.</p>\n' +
				'</Step_MDSVEX_D_G>\n</Steps_MDSVEX_D_G>'
		);
		for (const plugins of [
			[anchors(), links(), steps()],
			[steps(), anchors(), links()],
			[anchors(), steps(), links()],
		]) {
			expect(with_plugins(plugins)).toBe(expected);
		}
	});

	test('an anchor beside the heading is never external', () => {
		for (const plugins of [
			[anchors({ position: 'prepend' }), external_links({ icon: true })],
			[external_links({ icon: true }), anchors({ position: 'prepend' })],
		]) {
			expect(compile('## Plain\n', { heading_ids: true, plugins }).code).toBe(
				'<h2 id="plain"><a href="#plain" aria-hidden="true" tabindex="-1"></a>Plain</h2>'
			);
		}
	});

	test('a replaced a gets rel and target as props', () => {
		const code = compile('[x](https://example.com)', {
			plugins: [external_links({ target: '_blank' })],
			components: [{ specifier: '#lib/markdown.js', names: ['a'] }],
		}).code;
		expect(code).toContain(
			`<A_MDSVEX_G href="https://example.com" ${REL} target="_blank">x</A_MDSVEX_G>`
		);
	});
});

describe('tree', () => {
	/** every parser path builds one tree, the links printed with what the plugin set */
	function tree(source: string, options?: ExternalLinksOptions): unknown {
		return expect_parity(source, () => [external_links(options).parse!], {
			attrs: ['href', 'rel', 'target', 'tag', 'attributes'],
		});
	}

	const LINK = 'link href="https://example.com" rel="noopener noreferrer"';

	test('whole, fed and over the wire agree', () => {
		expect(
			tree(
				'a [b *c*](https://example.com) <https://example.com> [d](/d) [e](https://example.com\n'
			)
		).toEqual([
			'root',
			[
				'paragraph',
				'text:a ',
				[LINK, 'text:b ', ['strong_emphasis', 'text:c']],
				'text: ',
				[LINK, 'text:https://example.com'],
				'text: ',
				['link href="/d"', 'text:d'],
				'text: [e](https://example.com',
			],
		]);
	});

	test('the span is the last child on every path', () => {
		const span =
			'html tag="span" attributes={"role":"img","aria-label":"new tab"}';
		expect(
			tree('[a](https://example.com) and <https://example.com>\n', {
				target: '_blank',
				new_tab_label: 'new tab',
			})
		).toEqual([
			'root',
			[
				'paragraph',
				[LINK + ' target="_blank"', 'text:a', span],
				'text: and ',
				[LINK + ' target="_blank"', 'text:https://example.com', span],
			],
		]);
	});
});

describe('vite plugin', () => {
	test('the plugins option takes it', async () => {
		const [plugin] = mdsvex({
			plugins: [external_links({ target: '_blank' })],
		});
		const transform = plugin.transform as Function;
		const result = await transform.call(
			{ addWatchFile() {} },
			'[out](https://example.com) [in](/docs)\n',
			'/app/src/doc.svx'
		);
		expect(result.code).toContain(
			`<a href="https://example.com" ${REL} target="_blank">out</a> <a href="/docs">in</a>`
		);
	});
});

describe('as published', () => {
	test('the files it publishes are the ones its exports name', async () => {
		const root = write_app(HERE, {}, [dirname(HERE)]);
		try {
			const entry = createRequire(join(root, 'index.js')).resolve(
				'@mdsvex/plugin-external-links'
			);
			expect(entry).toBe(
				join(
					root,
					'node_modules',
					'@mdsvex',
					'plugin-external-links',
					'dist',
					'index.js'
				)
			);
			const installed = await import(pathToFileURL(entry).href);
			expect(
				compile('[x](https://example.com)', {
					plugins: [installed.external_links()],
				}).code
			).toBe(`<p><a href="https://example.com" ${REL}>x</a></p>`);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
