import { describe, it, expect } from 'vitest';
import { PFMParser, PluginDispatcher, WireEmitter } from '@mdsvex/parse';
import type { ParsePlugin } from '@mdsvex/parse';
import { WireTreeBuilder } from '@mdsvex/parse/wire-tree-builder';
import { autolink } from '../../../plugins/autolink/src/index';
import { CursorHTMLRenderer } from '../src/html_cursor';

/**
 * the preview html after each char over the wire, keyed by what was fed,
 * the cached renderer must draw what a fresh one does
 */
function html_steps(
	source: string,
	plugins?: ParsePlugin[]
): Map<string, string> {
	const emitter = new WireEmitter();
	const parser = new PFMParser(emitter);
	const builder = new WireTreeBuilder(
		128,
		plugins && new PluginDispatcher(plugins)
	);
	const cached = new CursorHTMLRenderer();
	const steps = new Map<string, string>();
	parser.init();
	for (let i = 0; i < source.length; i++) {
		const fed = source.slice(0, i + 1);
		emitter.set_source(fed);
		parser.feed(source[i]);
		builder.apply(emitter.flush());
		const fresh = new CursorHTMLRenderer({ cache: false });
		fresh.update(builder.get_buffer(), '');
		cached.update(builder.get_buffer(), '');
		expect(cached.html, `cached at ${JSON.stringify(fed)}`).toBe(fresh.html);
		steps.set(fed, fresh.html);
	}
	return steps;
}

describe('block quote preview while streaming', () => {
	it('shows a paragraph after a heading as its text arrives', () => {
		const html = html_steps('> # Foo\n> bar\n> baz\n');
		expect(html.get('> # Foo\n')).toBe(
			'<blockquote>\n<h1>Foo</h1>\n</blockquote>'
		);
		expect(html.get('> # Foo\n> b')).toBe(
			'<blockquote>\n<h1>Foo</h1><p>b</p>\n</blockquote>'
		);
		expect(html.get('> # Foo\n> bar')).toBe(
			'<blockquote>\n<h1>Foo</h1><p>bar</p>\n</blockquote>'
		);
		expect(html.get('> # Foo\n> bar\n> ba')).toBe(
			'<blockquote>\n<h1>Foo</h1><p>bar\nba</p>\n</blockquote>'
		);
	});

	it('shows it under a heading the autolink plugin wrapped', () => {
		const html = html_steps('> # Foo\n> bar\n> baz\n', [autolink()]);
		expect(html.get('> # Foo\n> bar')).toBe(
			'<blockquote>\n<h1 id="foo"><a href="#foo">Foo</a></h1><p>bar</p>\n</blockquote>'
		);
	});

	it('shows each line of a paragraph, a nested quote and a quote in a list item', () => {
		expect(html_steps('> a\n> b\n').get('> a\n> b')).toBe(
			'<blockquote>\n<p>a\nb</p>\n</blockquote>'
		);
		expect(html_steps('> a\n> > b\n> > c\n').get('> a\n> > b\n> > c')).toBe(
			'<blockquote>\n<p>a</p><blockquote>\n<p>b\nc</p>\n</blockquote>\n</blockquote>'
		);
		expect(html_steps('- x\n  > a\n  > b\n').get('- x\n  > a\n  > b')).toBe(
			'<ul>\n<li>x<blockquote>\n<p>a\nb</p>\n</blockquote></li>\n\n</ul>'
		);
	});
});
