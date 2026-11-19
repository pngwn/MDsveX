import { describe, expect, test } from 'vitest';

import { HeadingIdError, HeadingIds, heading_slug } from '../src/heading_ids';
import type { ParsePlugin } from '../src/plugin_types';
import type { NodeBuffer } from '../src/utils';
import { PATHS } from './plugin_harness';

const named = () => false;

/** heading ids in buffer order */
function heading_ids_in(nodes: NodeBuffer): string[] {
	const out: string[] = [];
	for (let i = 0; i < nodes.size; i++) {
		const id = nodes.metadata_at(i)?.id;
		if (nodes.kind_at(i) === 3 && typeof id === 'string') out.push(id);
	}
	return out;
}

/**
 * what ctx.id gave and the heading ids, on every path, which must agree,
 * headings false runs without heading ids
 */
function run_all(
	source: string,
	plugins: (given: string[]) => ParsePlugin[],
	headings = true
): { given: string[]; headings: string[] } {
	let first: { given: string[]; headings: string[] } | undefined;
	for (const [name, run] of PATHS) {
		const given: string[] = [];
		const out = run(source, {
			plugins: plugins(given),
			headings: headings ? new HeadingIds(heading_slug, named) : undefined,
		});
		const got = { given, headings: heading_ids_in(out.nodes) };
		if (first === undefined) first = got;
		else expect(got, name).toEqual(first);
	}
	return first!;
}

/** each link asks for an id from its text */
const links = (given: string[]): ParsePlugin => ({
	name: 'links',
	link: {
		parse(node, ctx) {
			return () => {
				node.attrs.id = ctx.id(node.text_content);
				given.push(node.attrs.id);
			};
		},
	},
});

describe('ctx.id', () => {
	test('gives a free id, a repeat gets -1, -2', () => {
		const out = run_all('[a](/1) [a](/2)\n\n[a 1](/3) [a](/4)', (given) => [
			links(given),
		]);
		expect(out.given).toEqual(['a', 'a-1', 'a 1', 'a-2']);
	});

	test('shares the ids of the document with its headings', () => {
		const out = run_all(
			'## Intro\n\n[intro](/a)\n\n## Intro\n\n[x](/b)\n\n## X',
			(given) => [links(given)]
		);
		expect(out.given).toEqual(['intro-1', 'x']);
		expect(out.headings).toEqual(['intro', 'intro-2', 'x-1']);
	});

	test('works without heading ids, among the ids plugins ask for', () => {
		const out = run_all(
			'## a\n\n[a](/1) [a](/2)',
			(given) => [links(given)],
			false
		);
		expect(out.given).toEqual(['a', 'a-1']);
		expect(out.headings).toEqual([]);
	});

	test('an id a revoked node was given is free again', () => {
		// the first star never closes, its paragraph revokes it
		const emphasis = (given: string[]): ParsePlugin => ({
			name: 'em',
			strong_emphasis: {
				parse(node, ctx) {
					given.push(ctx.id('e'));
				},
			},
		});
		const out = run_all('*a\n\n*b*', (given) => [emphasis(given)]);
		expect(out.given).toEqual(['e', 'e']);
	});

	test('fixed keeps the id, one a node before it was given is a HeadingIdError', () => {
		const fixed = (given: string[]): ParsePlugin => ({
			name: 'fixed',
			link: {
				parse(node, ctx) {
					return () => {
						given.push(ctx.id(node.text_content, { fixed: true }));
					};
				},
			},
		});
		const before = run_all('[intro](/a)\n\n## Intro', (given) => [
			fixed(given),
		]);
		expect(before).toEqual({ given: ['intro'], headings: ['intro-1'] });
		for (const [name, run] of PATHS) {
			expect(
				() =>
					run('## Intro\n\n[intro](/a)', {
						plugins: [fixed([])],
						headings: new HeadingIds(heading_slug, named),
					}),
				name
			).toThrow(HeadingIdError);
		}
	});

	test('in a sequential pass and a document hook the id comes after the rest', () => {
		const late = (given: string[]): ParsePlugin => ({
			name: 'late',
			sequential: true,
			heading: {
				parse(node, ctx) {
					given.push(ctx.id(node.text_content.toLowerCase()));
				},
			},
		});
		const out = run_all('## A\n\n## B', (given) => [late(given)]);
		expect(out).toEqual({ given: ['a-1', 'b-1'], headings: ['a', 'b'] });
	});

	test('takes a base that is a string, in a handler', () => {
		let kept: { id(base: string): string } | undefined;
		const plugin: ParsePlugin = {
			name: 'bad',
			heading: {
				parse(_node, ctx) {
					kept = ctx;
					expect(() => ctx.id('')).toThrow(TypeError);
					expect(() => ctx.id(1 as any)).toThrow(
						'ctx.id takes a base, a string that is not empty'
					);
				},
			},
		};
		run_all('# A', () => [plugin]);
		expect(() => kept!.id('x')).toThrow(TypeError);
	});
});
