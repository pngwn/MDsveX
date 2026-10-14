import { describe, expect, it } from 'vitest';

import { PFMParser, WireEmitter } from '../src/main';
import { SourceTextSource } from '../src/node_view';
import { PluginDispatcher } from '../src/plugin_dispatch';
import type { ParsePlugin, PluginContext } from '../src/plugin_types';
import type { TextRun } from '../src/text_run';
import { TreeBuilder } from '../src/tree_builder';
import {
	PATHS,
	expect_linked,
	expect_parity,
	expect_parity_logged,
	run_batch,
	shape,
} from './plugin_harness';

type OnText = (run: TextRun, ctx: PluginContext) => void;

const on_text = (text: OnText, all = false): ParsePlugin =>
	all ? { sequential: true, text, all_text: true } : { sequential: true, text };

const PARTY = '\u{1f389}';
const TABLE: Record<string, string> = { tada: PARTY, x: 'X', '+1': 'UP' };

/** every :name: in the table becomes its value */
const emoji = (all = false) =>
	on_text((run) => {
		for (const match of run.text.matchAll(/:([a-z0-9_+-]+):/g)) {
			const to = TABLE[match[1]];
			if (to === undefined) continue;
			run.replace(match.index, match.index + match[0].length, 'text', to);
		}
	}, all);

/** every #123 becomes a link */
const issues = () =>
	on_text((run) => {
		for (const match of run.text.matchAll(/#(\d+)/g)) {
			run
				.replace(match.index, match.index + match[0].length, 'link', {
					href: '/issues/' + match[1],
				})
				.append('text', match[0]);
		}
	});

/** every bare https url becomes a link whose text is the url */
const linkify = () =>
	on_text((run) => {
		for (const match of run.text.matchAll(/https:\/\/[^\s<]+/g)) {
			run
				.replace(match.index, match.index + match[0].length, 'link', {
					href: match[0],
				})
				.append('text', match[0]);
		}
	});

/** writes down every run it is given */
const logger = (log: string[], all = false) =>
	on_text((run) => {
		log.push(`${run.parent.type}: ${JSON.stringify(run.text)}`);
	}, all);

const HREF = { attrs: ['href', 'tag', 'name'] };

describe('a text handler', () => {
	it('replaces part of a run with text', () => {
		const tree = expect_parity('We shipped :tada: today.\n', () => [emoji()]);
		expect(tree).toEqual([
			'root',
			['paragraph', `text:We shipped ${PARTY} today.`],
		]);
	});

	it('gets neighbouring text nodes as one run', () => {
		// the batch builder has a text node at each colon and each underscore
		const { log } = expect_parity_logged(
			'at 10:30:00 see https://x.io/a_b_c?x=1&y=2 now\n',
			(log) => [logger(log)]
		);
		expect(log).toEqual([
			'paragraph: "at 10:30:00 see https://x.io/a_b_c?x=1&y=2 now"',
		]);
	});

	it('replaces part of a run with a node, which splits it', () => {
		const tree = expect_parity(
			'Fixed in #12 and #345, thanks.\n',
			() => [issues()],
			HREF
		);
		expect(tree).toEqual([
			'root',
			[
				'paragraph',
				'text:Fixed in ',
				['link href="/issues/12"', 'text:#12'],
				'text: and ',
				['link href="/issues/345"', 'text:#345'],
				'text:, thanks.',
			],
		]);
	});

	it('replaces a match that the batch builder holds in several nodes', () => {
		const tree = expect_parity(
			'see https://x.io/a_b_c?x=1&y=2 now\n',
			() => [linkify()],
			HREF
		);
		expect(tree).toEqual([
			'root',
			[
				'paragraph',
				'text:see ',
				[
					'link href="https://x.io/a_b_c?x=1&y=2"',
					'text:https://x.io/a_b_c?x=1&y=2',
				],
				'text: now',
			],
		]);
	});

	it('puts an element, a directive or any other node in', () => {
		const tree = expect_parity(
			'press ctrl+k to search\n',
			() => [
				on_text((run) => {
					const at = run.text.indexOf('ctrl+k');
					run
						.replace(at, at + 6, 'html', { tag: 'kbd' })
						.append('text', 'Ctrl K');
					const to = run.text.indexOf('search');
					run
						.replace(to, to + 6, 'directive_inline', { name: 'term' })
						.append('text', 'search');
				}),
			],
			HREF
		);
		expect(tree).toEqual([
			'root',
			[
				'paragraph',
				'text:press ',
				['html tag="kbd"', 'text:Ctrl K'],
				'text: to ',
				['directive_inline name="term"', 'text:search'],
			],
		]);
	});

	it('takes ranges in any order, by where they were in the text it was given', () => {
		const tree = expect_parity('abcdefgh\n', () => [
			on_text((run) => {
				run.replace(6, 8, 'text', '[gh]');
				run.replace(0, 2, 'text', '[ab]');
				run.replace(3, 4, 'text', '[d]');
				run.replace(4, 6, 'text', '[ef]');
			}),
		]);
		expect(tree).toEqual(['root', ['paragraph', 'text:[ab]c[d][ef][gh]']]);
	});

	it('replaces a whole run', () => {
		const tree = expect_parity(
			'*:tada:*\n',
			() => [
				on_text((run) => {
					run.replace(0, run.text.length, 'html', { tag: 'wbr' });
				}),
			],
			HREF
		);
		expect(tree).toEqual([
			'root',
			['paragraph', ['strong_emphasis', 'html tag="wbr"']],
		]);
	});

	it('puts a node in at a point with an empty range', () => {
		const tree = expect_parity(
			'super/long\n',
			() => [
				on_text((run) => {
					const at = run.text.indexOf('/') + 1;
					run.replace(at, at, 'html', { tag: 'wbr' });
					run.replace(at, at, 'html', { tag: 'i' });
					run.replace(0, 0, 'html', { tag: 'b' });
					run.replace(run.text.length, run.text.length, 'html', { tag: 'u' });
				}),
			],
			HREF
		);
		expect(tree).toEqual([
			'root',
			[
				'paragraph',
				'html tag="b"',
				'text:super/',
				'html tag="wbr"',
				'html tag="i"',
				'text:long',
				'html tag="u"',
			],
		]);
	});

	it('keeps a node put in at the end of a range after it and one at its start before it', () => {
		const tree = expect_parity(
			'abcdef\n',
			() => [
				on_text((run) => {
					run.replace(2, 2, 'html', { tag: 'b' });
					run.replace(4, 4, 'html', { tag: 'u' });
					run.replace(2, 4, 'text', '[cd]');
				}),
			],
			HREF
		);
		expect(tree).toEqual([
			'root',
			[
				'paragraph',
				'text:ab',
				'html tag="b"',
				'text:[cd]',
				'html tag="u"',
				'text:ef',
			],
		]);
	});

	it('leaves the text as written when it replaces nothing', () => {
		for (const [name, run] of PATHS) {
			const plain = run('a :b: c *d* `e`\n\n- f\n- g\n');
			const out = run('a :b: c *d* `e`\n\n- f\n- g\n', [emoji()]);
			expect(shape(out.nodes, out.source), name).toEqual(
				shape(plain.nodes, plain.source)
			);
		}
	});

	it('runs for the text of every inline container', () => {
		const { log } = expect_parity_logged(
			[
				'# head *strong*',
				'',
				'para _em_ ~~del~~ ^sup^ ~sub~ [link](/u) :dir[label] <span>el</span>',
				'second line',
				'',
				'- item',
				'',
				'| cell |',
				'|---|',
				'| body |',
				'',
				':::note[title]',
				'inside',
				':::',
				'',
			].join('\n'),
			(log) => [logger(log)]
		);
		expect(log).toEqual([
			'heading: "head "',
			'strong_emphasis: "strong"',
			'paragraph: "para "',
			'emphasis: "em"',
			'paragraph: " "',
			'strikethrough: "del"',
			'paragraph: " "',
			'superscript: "sup"',
			'paragraph: " "',
			'subscript: "sub"',
			'paragraph: " "',
			'link: "link"',
			'paragraph: " "',
			'directive_inline: "label"',
			'paragraph: " "',
			'html: "el"',
			// a line end is a node of its own, so a run stays on its line
			'paragraph: "second line"',
			'list_item: "item"',
			'table_cell: "cell"',
			'table_cell: "body"',
			'directive_label: "title"',
			'paragraph: "inside"',
		]);
	});

	it('reads the parent of its run and what is above it', () => {
		const { log } = expect_parity_logged('> a [b *c*](/u)\n', (log) => [
			on_text((run) => {
				const up: string[] = [];
				for (let at: typeof run.parent | null = run.parent; at; at = at.parent)
					up.push(at.type);
				log.push(`${run.text} in ${up.join(' ')}`);
			}),
		]);
		expect(log).toEqual([
			'a  in paragraph block_quote root',
			'b  in link paragraph block_quote root',
			'c in strong_emphasis link paragraph block_quote root',
		]);
	});

	it('shows in text_content', () => {
		const { log } = expect_parity_logged('# Done :tada: #7\n', (log) => [
			emoji(),
			issues(),
			{
				sequential: true,
				heading: {
					parse(node) {
						log.push(node.text_content);
					},
				},
			},
		]);
		expect(log).toEqual([`Done ${PARTY} #7`]);
	});

	it('gets its own context and writes data', () => {
		for (const [name, run] of PATHS) {
			const out = run('one :tada: two\n\nthree :tada:\n', [
				{
					name: 'count',
					sequential: true,
					text(run, ctx) {
						const found = run.text.split(':tada:').length - 1;
						ctx.set('emoji', ((ctx.data.emoji as number) ?? 0) + found);
					},
				},
			]);
			expect(out.dispatcher!.data(), name).toEqual({ count: { emoji: 2 } });
		}
	});
});

describe('text a revoke left behind', () => {
	it('is one run with the delimiter the parser gave up on', () => {
		const { tree, log } = expect_parity_logged('*a :tada: b\n', (log) => [
			logger(log),
			emoji(),
		]);
		expect(log).toEqual(['paragraph: "*a :tada: b"']);
		expect(tree).toEqual(['root', ['paragraph', `text:*a ${PARTY} b`]]);
	});

	it('is one run with the bracket of a link that got no destination', () => {
		const { tree, log } = expect_parity_logged(
			'see [a #12 b\n',
			(log) => [logger(log), issues()],
			HREF
		);
		expect(log).toEqual(['paragraph: "see [a #12 b"']);
		expect(tree).toEqual([
			'root',
			[
				'paragraph',
				'text:see [a ',
				['link href="/issues/12"', 'text:#12'],
				'text: b',
			],
		]);
	});

	it('is one run with the tag of an element that never closed', () => {
		const { log } = expect_parity_logged('a <b>bold :x: end', (log) => [
			logger(log),
		]);
		expect(log).toEqual(['paragraph: "a <b>bold :x: end"']);
	});

	it('is found in the paragraphs a block repair makes', () => {
		const { tree, log } = expect_parity_logged(
			'<div>\n\ntext :tada: here\n\n',
			(log) => [logger(log), emoji()]
		);
		expect(log).toEqual([
			'paragraph: "<div>"',
			'paragraph: "text :tada: here"',
		]);
		expect(tree).toEqual([
			'root',
			['paragraph', 'text:<div>'],
			['paragraph', `text:text ${PARTY} here`],
		]);
	});

	it('is found in a tight list, whose paragraphs are revoked', () => {
		const tree = expect_parity('- one :tada:\n- two #3\n', () => [
			emoji(),
			issues(),
		]);
		expect(tree).toEqual([
			'root',
			[
				'list',
				['list_item', `text:one ${PARTY}`],
				['list_item', 'text:two ', ['link', 'text:#3']],
			],
		]);
	});

	it('is found under delimiters that nest and are all given up on', () => {
		const { tree, log } = expect_parity_logged('_a *b :tada: ~~c #4', (log) => [
			logger(log),
			emoji(),
			issues(),
		]);
		expect(log).toEqual(['paragraph: "_a *b :tada: ~~c #4"']);
		expect(tree).toEqual([
			'root',
			['paragraph', `text:_a *b ${PARTY} ~~c `, ['link', 'text:#4']],
		]);
	});

	it('is found beside a node the parser kept inside a revoked one', () => {
		const tree = expect_parity('_x *:tada:* y :tada:\n', () => [emoji()]);
		expect(tree).toEqual([
			'root',
			[
				'paragraph',
				'text:_x ',
				['strong_emphasis', `text:${PARTY}`],
				`text: y ${PARTY}`,
			],
		]);
	});

	it('is found in a code span that never closed', () => {
		const { log } = expect_parity_logged('a `b :x: c\n', (log) => [
			logger(log),
		]);
		expect(log).toEqual(['paragraph: "a `b :x: c"']);
	});
});

describe('text that arrives in pieces', () => {
	it('is whole when the handler runs, however the source was fed', () => {
		const words = 'lorem ipsum dolor sit amet consectetur '.repeat(6);
		const source = `${words}:tada: ${words}#77 ${words}\n`;
		const { tree, log } = expect_parity_logged(source, (log) => [
			logger(log),
			emoji(),
			issues(),
		]);
		expect(log).toEqual([
			`paragraph: ${JSON.stringify(`${words}:tada: ${words}#77 ${words}`)}`,
		]);
		expect(tree).toEqual([
			'root',
			[
				'paragraph',
				`text:${words}${PARTY} ${words}`,
				['link', 'text:#77'],
				`text: ${words}`,
			],
		]);
	});

	it('is the same run for a match cut by every feed boundary', () => {
		const tree = expect_parity('a:tada:b :tada::tada:\n', () => [emoji()]);
		expect(tree).toEqual([
			'root',
			['paragraph', `text:a${PARTY}b ${PARTY}${PARTY}`],
		]);
	});
});

describe('what a text handler is kept from', () => {
	const doc = [
		'`:tada:` and $`:tada:`$ and <code>:tada:</code> and <kbd>:tada:</kbd>',
		'<https://x.io/:tada:> ![:tada:](a.png) [:tada:](/:tada: ":tada:")',
		'{":tada:"} <span title=":tada:">in</span> <!-- :tada: -->',
		'',
		'```',
		':tada:',
		'```',
		'',
		'<pre>',
		':tada:',
		'</pre>',
		'',
	].join('\n');

	it('is code, math, urls, attributes, expressions, comments and raw text', () => {
		const { log } = expect_parity_logged(doc, (log) => [logger(log)]);
		expect(log).toEqual([
			'paragraph: " and "',
			'paragraph: " and "',
			'paragraph: " and "',
			'paragraph: " "',
			'paragraph: " "',
			'link: ":tada:"',
			'paragraph: " "',
			'html: "in"',
			'paragraph: " "',
		]);
	});

	it('is given the text of code elements, autolinks and alt text when it asks for all', () => {
		const { log } = expect_parity_logged(doc, (log) => [logger(log, true)]);
		expect(log).toEqual([
			'paragraph: " and "',
			'paragraph: " and "',
			'html: ":tada:"',
			'paragraph: " and "',
			'html: ":tada:"',
			'link: "https://x.io/:tada:"',
			'paragraph: " "',
			'image: ":tada:"',
			'paragraph: " "',
			'link: ":tada:"',
			'paragraph: " "',
			'html: "in"',
			'paragraph: " "',
		]);
	});

	it('is a character the author escaped, which is in no run', () => {
		const { tree, log } = expect_parity_logged(
			'a \\:tada: b :tada\\: c \\#5 #6 x\\\\:tada:\n',
			(log) => [logger(log), emoji(), issues()]
		);
		expect(log).toEqual([
			'paragraph: "a "',
			'paragraph: "tada: b :tada"',
			'paragraph: " c "',
			'paragraph: "5 #6 x"',
			// an escaped backslash, the colon after it is not escaped
			`paragraph: ":tada:"`,
		]);
		expect(tree).toEqual([
			'root',
			[
				'paragraph',
				'text:a :tada: b :tada: c #5 ',
				['link', 'text:#6'],
				`text: x\\${PARTY}`,
			],
		]);
	});

	it('is given escaped characters when it asks for all', () => {
		const { tree, log } = expect_parity_logged('a \\:tada: b\n', (log) => [
			logger(log, true),
			emoji(true),
		]);
		expect(log).toEqual(['paragraph: "a :tada: b"']);
		expect(tree).toEqual(['root', ['paragraph', `text:a ${PARTY} b`]]);
	});

	it('is told over the wire which characters were escaped', () => {
		const emitter = new WireEmitter();
		const source = 'a \\:b \\\\:c\n';
		emitter.set_source(source);
		new PFMParser(emitter).parse(source);
		const texts = emitter.flush().filter((op) => op[0] === 'T');
		expect(texts.map((op) => op.slice(2))).toEqual([
			['a '],
			[':b ', 1],
			['\\', 1],
			[':c'],
		]);
	});
});

describe('text plugins in order', () => {
	it('each sees the text the one before it left', () => {
		const { tree, log } = expect_parity_logged(':tada: :x:\n', (log) => [
			emoji(),
			logger(log),
			on_text((run) => {
				const at = run.text.indexOf('X');
				if (at !== -1) run.replace(at, at + 1, 'text', 'Y');
			}),
		]);
		expect(log).toEqual([`paragraph: "${PARTY} X"`]);
		expect(tree).toEqual(['root', ['paragraph', `text:${PARTY} Y`]]);
	});

	it('a link whose text is its url is kept from the plugins after it', () => {
		const tree = expect_parity(
			'go https://x.io/:tada:/ now :tada:\n',
			() => [linkify(), emoji()],
			HREF
		);
		expect(tree).toEqual([
			'root',
			[
				'paragraph',
				'text:go ',
				['link href="https://x.io/:tada:/"', 'text:https://x.io/:tada:/'],
				`text: now ${PARTY}`,
			],
		]);
	});

	it('a link whose text is its url is kept back whatever else it holds', () => {
		const tree = expect_parity(
			'<https://x.io/:tada:> :tada:\n',
			() => [
				{
					link: {
						parse: (node) => () => {
							node.append('html', { tag: 'span' });
						},
					},
				},
				emoji(),
			],
			HREF
		);
		expect(tree).toEqual([
			'root',
			[
				'paragraph',
				[
					'link href="https://x.io/:tada:"',
					'text:https://x.io/:tada:',
					'html tag="span"',
				],
				`text: ${PARTY}`,
			],
		]);
	});

	it('the text of a link a plugin made is a run for the plugins after it', () => {
		const tree = expect_parity(
			'see #1\n',
			() => [
				issues(),
				on_text((run) => {
					if (run.parent.type !== 'link') return;
					run.replace(0, 1, 'text', 'no. ');
				}),
			],
			HREF
		);
		expect(tree).toEqual([
			'root',
			['paragraph', 'text:see ', ['link href="/issues/1"', 'text:no. 1']],
		]);
	});

	it('a handler of the same plugin is not called for the nodes its text handler made', () => {
		const { log } = expect_parity_logged('a #1 [b](/b)\n', (log) => [
			{
				sequential: true,
				text: issues().text,
				link: {
					parse(node) {
						log.push('own ' + node.attrs.href);
					},
				},
			},
			{
				sequential: true,
				link: {
					parse(node) {
						log.push('next ' + node.attrs.href);
					},
				},
			},
		]);
		expect(log).toEqual(['own /b', 'next /issues/1', 'next /b']);
	});

	it('a fused handler reads the text as written, a sequential one after it as rewritten', () => {
		const { log } = expect_parity_logged('hi :tada:\n', (log) => [
			{
				paragraph: {
					parse: (node) => () => {
						log.push('fused ' + node.text_content);
					},
				},
			},
			emoji(),
			{
				sequential: true,
				paragraph: {
					parse(node) {
						log.push('sequential ' + node.text_content);
					},
				},
			},
		]);
		expect(log).toEqual(['fused hi :tada:', `sequential hi ${PARTY}`]);
	});
});

describe('what replace leaves in the buffer', () => {
	it('keeps the source range of the text around a replacement, which spans what it replaced', () => {
		const source = 'ab :tada: cd #7\n';
		const out = run_batch(source, [emoji(), issues()]);
		const nodes = out.nodes;
		const para = nodes.first_child_at(0);
		const kids: unknown[][] = [];
		for (
			let child = nodes.first_child_at(para);
			child !== 0xffffffff;
			child = nodes.next_at(child)
		) {
			kids.push([
				nodes.get_node(child).kind,
				nodes.synthetic_at(child),
				source.slice(nodes.start_at(child), nodes.end_at(child)),
				source.slice(nodes.value_start_at(child), nodes.value_end_at(child)),
			]);
		}
		expect(kids).toEqual([
			['text', false, 'ab ', 'ab '],
			['text', true, ':tada:', ''],
			['text', false, ' cd ', ' cd '],
			['link', true, '#7', ''],
		]);
	});

	it('puts a node that went in at a point at that point of the source', () => {
		const source = 'ab/cd\n';
		const out = run_batch(source, [
			on_text((run) => {
				run.replace(3, 3, 'html', { tag: 'wbr' });
				run.replace(5, 5, 'html', { tag: 'i' });
			}),
		]);
		const nodes = out.nodes;
		const para = nodes.first_child_at(0);
		const spans: number[][] = [];
		for (
			let child = nodes.first_child_at(para);
			child !== 0xffffffff;
			child = nodes.next_at(child)
		) {
			if (nodes.synthetic_at(child))
				spans.push([nodes.start_at(child), nodes.end_at(child)]);
		}
		expect(spans).toEqual([
			[3, 3],
			[5, 5],
		]);
	});

	it('keeps text a plugin made as text a plugin made when a later one splits it', () => {
		const out = run_batch('a\n', [
			on_text((run) => {
				run.replace(0, 1, 'text', 'x{y}z');
			}),
			on_text((run) => {
				run.replace(1, 4, 'html', { tag: 'b' });
			}),
		]);
		const nodes = out.nodes;
		const para = nodes.first_child_at(0);
		const first = nodes.first_child_at(para);
		const last = nodes.last_child_at(para);
		expect(nodes._strings[first]).toBe('x');
		expect(nodes._strings[last]).toBe('z');
		expect(nodes.synthetic_at(first)).toBe(true);
		expect(nodes.synthetic_at(last)).toBe(true);
		expect_linked(nodes);
	});
});

describe('a text handler that is used wrongly', () => {
	const failing = (parse: OnText) => () =>
		run_batch('abcdef :tada:\n', [on_text(parse)]);

	it('throws for a plugin that is not sequential', () => {
		const make = (plugin: ParsePlugin) => () =>
			new PluginDispatcher([plugin], new SourceTextSource(''));
		expect(make({ text() {} })).toThrow(TypeError);
		expect(make({ name: 'emoji', text() {} })).toThrow(
			'the text handler of the emoji plugin needs the tree to be complete, set sequential: true on the plugin'
		);
	});

	it('throws when it is not a function', () => {
		const make = (plugin: ParsePlugin) => () =>
			new PluginDispatcher([plugin], new SourceTextSource(''));
		expect(make({ sequential: true, text: { parse() {} } as any })).toThrow(
			'the text handler of a plugin must be a function that takes a run of text'
		);
		expect(make({ text: { parse() {} } as any })).toThrow(TypeError);
	});

	it('throws for a range outside the run', () => {
		expect(failing((run) => run.replace(-1, 2, 'text', 'x'))).toThrow(
			RangeError
		);
		expect(failing((run) => run.replace(3, 2, 'text', 'x'))).toThrow(
			RangeError
		);
		expect(failing((run) => run.replace(0, 99, 'text', 'x'))).toThrow(
			'replace: 0 to 99 is not a range of a run of 13 characters'
		);
	});

	it('throws for a range that is not whole numbers', () => {
		expect(failing((run) => run.replace(0.5, 2, 'text', 'x'))).toThrow(
			TypeError
		);
		expect(
			failing((run) => run.replace(0, undefined as any, 'text', 'x'))
		).toThrow(TypeError);
	});

	it('throws for a range that overlaps one already replaced', () => {
		expect(
			failing((run) => {
				run.replace(1, 4, 'text', 'x');
				run.replace(3, 5, 'text', 'y');
			})
		).toThrow(
			'replace: 3 to 5 overlaps a range of this run that was already replaced'
		);
		expect(
			failing((run) => {
				run.replace(1, 4, 'text', 'x');
				run.replace(2, 2, 'html', { tag: 'wbr' });
			})
		).toThrow(RangeError);
		expect(
			failing((run) => {
				run.replace(2, 2, 'html', { tag: 'wbr' });
				run.replace(1, 4, 'text', 'x');
			})
		).toThrow(RangeError);
	});

	it('throws for a text node with no text and for text given to another node', () => {
		expect(failing((run) => run.replace(0, 1, 'text' as string))).toThrow(
			TypeError
		);
		expect(failing((run) => run.replace(0, 1, 'link', 'text' as any))).toThrow(
			TypeError
		);
		expect(failing((run) => run.replace(0, 1, 'nope'))).toThrow(
			'Unknown node type: nope'
		);
	});

	it('throws when it returns a function, a run has no close', () => {
		expect(failing((() => () => {}) as any)).toThrow(TypeError);
	});

	it('throws when a run is used after its document', () => {
		let kept: TextRun | undefined;
		const dispatcher = new PluginDispatcher(
			[
				on_text((run) => {
					kept ??= run;
				}),
			],
			new SourceTextSource('a\n')
		);
		const tree = new TreeBuilder(16, dispatcher);
		new PFMParser(tree).parse('a\n');
		dispatcher.run_sequential(tree.get_buffer());
		tree.reset();
		expect(() => kept!.replace(0, 1, 'text', 'x')).toThrow(
			'a TextRun was used after its document'
		);
		expect(() => kept!.parent).toThrow('a TextRun was used after its document');
	});
});

/** a seeded generator, so a failure names its document */
function random(seed: number): () => number {
	return () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const PIECES = [
	':tada:',
	':x:',
	':+1:',
	'#12',
	'#3',
	'https://x.io/a_b',
	' ',
	' ',
	'word',
	'a:b',
	'\\:',
	'\\#',
	'\\\\',
	'*',
	'_',
	'~~',
	'^',
	'[',
	'](/u)',
	'`',
	'<b>',
	'</b>',
	'<code>',
	'</code>',
	'\n',
	'\n\n',
	'\n- ',
	'\n> ',
	'| ',
	'\n|---|\n',
	'{x}',
	'&amp;',
	':d[',
	']',
	'![',
];

describe('random documents', () => {
	it('give one tree on every path, with text replaced and split', () => {
		for (let seed = 1; seed <= 400; seed++) {
			const rand = random(seed);
			let source = '';
			const count = 4 + Math.floor(rand() * 24);
			for (let i = 0; i < count; i++) {
				source += PIECES[Math.floor(rand() * PIECES.length)];
			}
			let first: unknown;
			let first_log: string[] | undefined;
			for (const [name, run] of PATHS) {
				const log: string[] = [];
				const out = run(source, [logger(log), emoji(), issues(), linkify()]);
				expect_linked(out.nodes);
				const tree = shape(out.nodes, out.source, 0, {
					attrs: ['href'],
					merge_text: true,
				});
				const where = `${name}, seed ${seed}, ${JSON.stringify(source)}`;
				if (first === undefined) {
					first = tree;
					first_log = log;
				} else {
					expect(log, where).toEqual(first_log);
					expect(tree, where).toEqual(first);
				}
			}
		}
	});
});
