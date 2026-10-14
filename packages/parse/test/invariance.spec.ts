import { writeFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

import {
	CONTAINERS,
	Grammar,
	contained,
	inline_text,
	edited,
	outline,
	rows_of,
	shrink_text,
} from './grammar';
import type { Container, Level, Piece, Seen } from './grammar';
import {
	broken_by,
	cell_mismatch,
	container_broken,
	container_mismatch,
	is_tight,
	placed,
	shrink,
} from './invariance';
import type { Invariant, Rule, Site } from './invariance';
import * as main from '../src/main';
import { parse_markdown_svelte } from '../src/main';
import { TreeBuilder } from '../src/tree_builder';
import { print_ast } from './print';
import { PATHS, shape } from './plugin_harness';
import type { ParsePlugin } from '../src/plugin_types';

/** a second parser with every fast path off, the module reads the flag once as it loads */
async function general_parser(): Promise<typeof import('../src/main')> {
	const flags = globalThis as { __pfm_general__?: boolean };
	flags.__pfm_general__ = true;
	try {
		const id = '../src/main?general';
		return await import(/* @vite-ignore */ id);
	} finally {
		delete flags.__pfm_general__;
	}
}

/** the opcodes a wire client gets from each chunk of a feed */
function wire_batches(parser: typeof import('../src/main'), source: string) {
	const emitter = new parser.WireEmitter();
	const fed = new parser.PFMParser(emitter);
	const batches: string[] = [];
	fed.init();
	for (let i = 0; i < source.length; i += 5) {
		emitter.set_source(source.slice(0, i + 5));
		fed.feed(source.slice(i, i + 5));
		batches.push(JSON.stringify(emitter.flush()));
	}
	emitter.set_source(source);
	fed.finish();
	batches.push(JSON.stringify(emitter.flush()));
	return batches.join('\n');
}

/** the tree a builder holds after each chunk of a feed */
function fed_trees(parser: typeof import('../src/main'), source: string) {
	const tree = new TreeBuilder(source.length || 16);
	const fed = new parser.PFMParser(tree);
	const trees: string[] = [];
	fed.init();
	for (let i = 0; i < source.length; i += 5) {
		fed.feed(source.slice(i, i + 5));
		trees.push(print_ast(tree.get_buffer(), source));
	}
	fed.finish();
	trees.push(print_ast(tree.get_buffer(), source));
	return trees.join('\n');
}

/** the runs a text handler of a parse plugin is given, and the tree it leaves */
function text_runs(parser: typeof import('../src/main'), source: string) {
	const runs: string[] = [];
	const { nodes } = parser.parse_markdown_svelte(source, {
		plugins: [
			{
				sequential: true,
				text(run) {
					runs.push(`${run.parent.type}: ${JSON.stringify(run.text)}`);
				},
			},
		],
	});
	return runs.join('\n') + print_ast(nodes, source);
}

/**
 * defers on the nodes the parser opens on a guess and on blocks, each task
 * marks its node, adds a node inside it and an entry to a list, the tasks
 * finish in an order of their own
 */
function deferring(): ParsePlugin[] {
	const kinds = [
		'paragraph',
		'heading',
		'strong_emphasis',
		'emphasis',
		'link',
		'code_span',
		'list_item',
		'block_quote',
		'table_cell',
		'html',
		'directive_inline',
		'directive_leaf',
		'directive_container',
	];
	let count = 0;
	const plugin: ParsePlugin = { name: 'defers' };
	for (const kind of kinds) {
		plugin[kind] = {
			parse(node, ctx) {
				const wait = count++ % 3;
				return () =>
					ctx.defer(node, async (own, c) => {
						for (let i = 0; i < wait; i++) await Promise.resolve();
						own.attrs.task = own.type;
						own.append('html', { tag: 'mark' });
						c.add('seen', own.type);
					});
			},
		};
	}
	return [plugin];
}

function near(seen: Seen): Container {
	return seen.inside[seen.inside.length - 1] ?? 'root';
}

function is(seen: Seen, ...kinds: string[]): boolean {
	return kinds.includes(seen.piece.kind);
}

interface Intended extends Rule {
	/** the PFM.md sentence or the decision that makes it intended */
	why: string;
	/** an invariant it breaks in an edited source, and what the smallest such source holds */
	edited?: [Invariant, RegExp];
}

/**
 * every intended difference between a container and the root
 * a difference that is not here is a failure
 */
const INTENDED: Intended[] = [
	{
		what: 'frontmatter and imports are read at the root only',
		why: 'frontmatter opens a file, and an import is a statement of the module the file compiles to',
		drop: (seen) =>
			seen.inside.length > 0 &&
			(seen.piece.kind === 'frontmatter' || seen.piece.kind === 'import'),
	},
	{
		what: 'two thematic breaks of dashes at the top of a file are frontmatter',
		why: 'frontmatter is the first line of a file, so the same lines in a container are two breaks',
		drop: (seen) =>
			seen.inside.length === 1 &&
			seen.under.length === 0 &&
			seen.before === null &&
			is(seen, 'thematic_break') &&
			seen.piece.form === 0,
	},
	{
		what: 'a link reference definition leaves no node',
		why: 'its destination and title are in the links that use it, and a title may run over lines, so their words are in no node',
		edited: ['content', /^(?:[ \t>]|[-*+] |\d+[.)] )*\[[^\]\n]+\]:/m],
	},
	{
		what: 'the cells of a table row past the column count are left out of the tree',
		why: 'GFM, the base of PFM tables: "the excess is ignored", so lost_words does not ask for the words of such a row',
	},
	{
		what: 'a tight list item holds the content of a paragraph with no paragraph around it',
		why: 'PFM.md, Lists: "no blank lines between items = tight (no `<p>` wrappers)"',
		expect: (kids, site, tight) =>
			site === 'list_item' && tight
				? kids.flatMap((kid) => (kid.kind === 'paragraph' ? kid.kids : [kid]))
				: kids,
	},
	{
		what: 'a list marker and a thematic break of its character are one thematic break',
		why: 'CommonMark, the baseline: `- ---` and `* * *` are thematic breaks before they are list items (examples 60 and 61)',
		// a rule does not see the marker of the list, so no break of dashes or asterisks opens an item
		drop: (seen) =>
			near(seen) === 'list_item' &&
			seen.before === null &&
			seen.piece.kind === 'thematic_break' &&
			seen.piece.form < 2,
	},
	{
		what: 'in a list item any ordered marker ends a paragraph, elsewhere only `1.` does',
		why: 'PFM.md, Blockquotes: "a bullet or `1.` with text after it, and any marker when the paragraph is in a list", so the generator writes no `7.` list straight after a block',
	},
];

interface Known extends Rule {
	issue: number;
	/** an invariant it breaks in an edited source, and what the smallest such source holds */
	edited?: [Invariant, RegExp];
	/** the smallest source that fails, a fix makes it pass and this entry is then removed */
	example: { site: Site; source: string; loose?: boolean };
}

/** every known failure, each one takes its pieces out of the documents until its issue is fixed */
const KNOWN: Known[] = [];

const RULES: Rule[] = [...INTENDED, ...KNOWN];

interface Subject {
	site: Site;
	/** text for a source that is edited after it is written, which shrinks by lines and characters */
	level: Level | 'text';
	blocks: Piece[];
	source: (blocks: Piece[]) => string;
	check: Check;
}

type Check = (blocks: Piece[], only?: Invariant) => Map<Invariant, string>;

/** the container invariant, and the invariants of a file on the document inside the container */
function check_container(site: Container, blocks: Piece[], only?: Invariant) {
	const rows = rows_of(blocks);
	const found =
		only === undefined || only === 'container'
			? container_broken(site, rows, is_tight(blocks), RULES)
			: null;
	const out =
		only === 'container'
			? new Map<Invariant, string>()
			: broken_by(`${contained(site, rows).join('\n')}\n`, only);
	if (found !== null) out.set(found[0], found[1]);
	return out;
}

function check_cell(text: string) {
	const out = new Map<Invariant, string>();
	const found = cell_mismatch(text, RULES);
	if (found !== null) out.set(found[0], found[1]);
	return out;
}

/** what one seed tests, a file at the root and in each container, the file with edits and one table cell */
function subjects(seed: number): Subject[] {
	const grammar = new Grammar(seed);
	const file = grammar.file();
	const ending = grammar.ending();
	const whole = (blocks: Piece[]): string =>
		rows_of(blocks).join('\n') + ending;
	const out: Subject[] = [
		{
			site: 'root',
			level: 'block',
			blocks: file,
			source: whole,
			check: (blocks, only) => broken_by(whole(blocks), only),
		},
	];
	for (const site of CONTAINERS) {
		out.push({
			site,
			level: 'block',
			blocks: file,
			source: (blocks) => rows_of(blocks).join('\n'),
			check: (blocks, only) => check_container(site, blocks, only),
		});
	}
	out.push({
		site: 'root',
		level: 'text',
		blocks: file,
		source: (blocks) => edited(whole(blocks), seed),
		check: (blocks, only) => broken_by(edited(whole(blocks), seed), only),
	});
	out.push({
		site: 'table_cell',
		level: 'inline',
		blocks: grammar.cell(),
		source: inline_text,
		check: (blocks) => check_cell(inline_text(blocks)),
	});
	return out;
}

/** the known failure or intended difference an edited source shows, read off the smallest source that still fails */
function known_edit(
	source: string,
	invariant: Invariant
): [Known | Intended | undefined, string] {
	const least = shrink_text(source, (next) =>
		broken_by(next, invariant).has(invariant)
	);
	const rule = [...INTENDED, ...KNOWN].find(
		(known) => known.edited?.[0] === invariant && known.edited[1].test(least)
	);
	return [rule, least];
}

function fails(example: Known['example']): boolean {
	const { site, source } = example;
	if (site === 'root') return broken_by(source).size > 0;
	if (site === 'table_cell') return cell_mismatch(source, INTENDED) !== null;
	const rows = source.split('\n');
	return (
		container_mismatch(site, rows, example.loose !== true, INTENDED) !== ''
	);
}

// PFM_SEEDS=from-to runs another range, a fix is checked against a wide one
// with few rules left a document keeps all its pieces, 40 seeds take what 100 took
const [first_seed, last_seed] = (process.env.PFM_SEEDS ?? '0-40')
	.split('-')
	.map(Number);
const census = process.env.PFM_CENSUS;

describe.skipIf(census !== undefined)('invariance', () => {
	test(
		'a document is the same tree in every container, whole and fed, batch and wire',
		{ timeout: process.env.PFM_SEEDS === undefined ? 60_000 : 0 },
		() => {
			const found: string[] = [];
			for (let seed = first_seed; seed < last_seed; seed++) {
				for (const subject of subjects(seed)) {
					const blocks = placed(subject.site, subject.blocks, RULES);
					for (const [invariant, detail] of subject.check(blocks)) {
						const source = subject.source(blocks);
						if (subject.level === 'text' && known_edit(source, invariant)[0])
							continue;
						found.push(
							`seed ${seed} in ${subject.site}, ${invariant}: ${detail}\n${source}`
						);
					}
				}
			}
			expect(found).toEqual([]);
		}
	);

	test(
		'a fast path builds the tree of the general path',
		{ timeout: process.env.PFM_SEEDS === undefined ? 60_000 : 0 },
		async () => {
			const general = await general_parser();
			const found: string[] = [];
			for (let seed = first_seed; seed < last_seed; seed++) {
				for (const subject of subjects(seed)) {
					const source = subject.source(
						placed(subject.site, subject.blocks, RULES)
					);
					const fast = print_ast(parse_markdown_svelte(source).nodes, source);
					const slow = print_ast(
						general.parse_markdown_svelte(source).nodes,
						source
					);
					if (fast !== slow)
						found.push(`seed ${seed} in ${subject.site}\n${source}`);
					// a feed shows a client the same after every chunk
					else if (
						wire_batches(main, source) !== wire_batches(general, source) ||
						fed_trees(main, source) !== fed_trees(general, source) ||
						text_runs(main, source) !== text_runs(general, source)
					)
						found.push(`seed ${seed} in ${subject.site}, fed\n${source}`);
				}
			}
			expect(found).toEqual([]);
		}
	);

	test(
		'a plugin that defers settles to one tree, whole and fed, batch and wire',
		{ timeout: process.env.PFM_SEEDS === undefined ? 60_000 : 0 },
		async () => {
			const found: string[] = [];
			for (let seed = first_seed; seed < last_seed; seed++) {
				for (const subject of subjects(seed)) {
					if (subject.site === 'table_cell') continue;
					const source = subject.source(
						placed(subject.site, subject.blocks, RULES)
					);
					let first = '';
					for (const [name, run] of PATHS) {
						const out = run(source, deferring());
						const dispatcher = out.dispatcher!;
						await dispatcher.settle();
						const now = JSON.stringify([
							shape(out.nodes, out.source, 0, {
								attrs: ['task'],
								merge_text: true,
							}),
							dispatcher.data(),
							dispatcher.deferred,
						]);
						if (name === PATHS[0][0]) first = now;
						else if (now !== first) {
							found.push(`seed ${seed} in ${subject.site}, ${name}\n${source}`);
							break;
						}
					}
				}
			}
			expect(found).toEqual([]);
		}
	);

	test.each(KNOWN)('#$issue is still open: $what', ({ example }) => {
		// a fix makes this fail, the entry is then taken out of KNOWN
		expect(fails(example)).toBe(true);
	});
});

interface Group {
	count: number;
	examples: { seed: number; source: string; detail: string }[];
}

// PFM_CENSUS=from-to writes every failure of the range to PFM_CENSUS_OUT, known ones by issue
describe.skipIf(census === undefined)('census', () => {
	test(
		'every failure of a seed range, grouped by its smallest form',
		{ timeout: 0 },
		async () => {
			const [from, to] = census!.split('-').map(Number);
			const known = new Map<string, number>();
			const groups = new Map<string, Group>();
			const count = (rule: Known | Intended | undefined): void => {
				const key =
					rule === undefined
						? 'several'
						: 'issue' in rule
							? `#${rule.issue} ${rule.what}`
							: `intended, ${rule.what}`;
				known.set(key, (known.get(key) ?? 0) + 1);
			};
			let documents = 0;
			for (let seed = from; seed < to; seed++) {
				// lets the runner hear from a run of minutes
				if (seed % 20 === 0) await new Promise((done) => setTimeout(done));
				for (const subject of subjects(seed)) {
					const { site, check } = subject;
					documents++;
					const raw = check(placed(site, subject.blocks, INTENDED));
					if (raw.size === 0) continue;
					const clean = placed(site, subject.blocks, RULES);
					const left = check(clean);
					for (const invariant of raw.keys()) {
						if (left.has(invariant)) continue;
						count(
							KNOWN.find(
								(rule) =>
									rule.drop !== undefined &&
									!check(
										placed(site, subject.blocks, [...INTENDED, rule]),
										invariant
									).has(invariant)
							)
						);
					}
					for (const invariant of left.keys()) {
						let key: string;
						let source: string;
						let detail: string;
						if (subject.level === 'text') {
							const [rule, least] = known_edit(
								subject.source(clean),
								invariant
							);
							if (rule !== undefined) {
								count(rule);
								continue;
							}
							source = least;
							detail = broken_by(source, invariant).get(invariant) ?? '';
							key = `${invariant} | edited | ${source.replace(/q\d{3}/g, 'w')}`;
						} else {
							const still = (next: Piece[]): boolean =>
								check(placed(site, next, RULES), invariant).has(invariant);
							const least = placed(
								site,
								shrink(clean, still, subject.level),
								RULES
							);
							source = subject.source(least);
							detail = check(least, invariant).get(invariant) ?? '';
							key = `${invariant} | ${site} | ${outline(least)}`;
						}
						let group = groups.get(key);
						if (group === undefined)
							groups.set(key, (group = { count: 0, examples: [] }));
						group.count++;
						if (group.examples.length < 2)
							group.examples.push({ seed, source, detail });
					}
				}
			}
			const report = {
				documents,
				known: [...known].sort((a, b) => b[1] - a[1]),
				groups: [...groups]
					.sort((a, b) => b[1].count - a[1].count)
					.map(([key, group]) => ({ key, ...group })),
			};
			writeFileSync(
				process.env.PFM_CENSUS_OUT ?? 'census.json',
				JSON.stringify(report, null, '\t')
			);
		}
	);
});
