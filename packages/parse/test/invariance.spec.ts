import { writeFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

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
	container_mismatch,
	guard_trips,
	is_tight,
	placed,
	shrink,
	watch_guard,
} from './invariance';
import type { Invariant, Rule, Shape, Site } from './invariance';

function deep(kids: Shape[], change: (shape: Shape) => Shape): Shape[] {
	return kids.map((kid) => change({ ...kid, kids: deep(kid.kids, change) }));
}

/** a value that runs over lines is a source range, so it holds what the container puts before each line */
function prefixed(
	site: Site,
	kinds: string[],
	from: number,
	prefix: (row: string) => string
): Rule['expect'] {
	return (kids, at) =>
		at !== site
			? kids
			: deep(kids, (shape) => {
					if (shape.value === null || !kinds.includes(shape.kind)) return shape;
					const rows = shape.value.split('\n');
					const value = rows.map((row, i) => (i < from ? row : prefix(row)));
					return { ...shape, value: value.join('\n') };
				});
}

function near(seen: Seen): Container {
	return seen.inside[seen.inside.length - 1] ?? 'root';
}

function within(seen: Seen, ...sites: Container[]): boolean {
	return sites.some((site) => seen.inside.includes(site));
}

function is(seen: Seen, ...kinds: string[]): boolean {
	return kinds.includes(seen.piece.kind);
}

interface Intended extends Rule {
	/** the PFM.md sentence or the decision that makes it intended */
	why: string;
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
		what: 'the value of a fence in a block quote keeps the marker of each line',
		why: 'the value is a source range and the renderer drops the markers (strip_bq in html_cursor.ts)',
		expect: prefixed('block_quote', ['code_fence'], 0, (row) =>
			row === '' ? '>' : `> ${row}`
		),
	},
	{
		what: 'a list marker and a thematic break of its character are one thematic break',
		why: 'CommonMark, the baseline: `- ---` and `* * *` are thematic breaks before they are list items (examples 60 and 61)',
		drop: (seen) =>
			seen.inside.length === 1 &&
			seen.inside[0] === 'list_item' &&
			seen.before === null &&
			seen.piece.kind === 'thematic_break' &&
			seen.piece.form === 0,
	},
	{
		what: 'in a list item any ordered marker ends a paragraph, elsewhere only `1.` does',
		why: 'PFM.md, Blockquotes: "a bullet or `1.` with text after it, and any marker when the paragraph is in a list", so the generator writes no `7.` list straight after a block',
	},
	{
		what: 'a link reference definition is a paragraph in a block quote and in a list item',
		why: 'try_parse_link_ref_definition returns at once inside either, and design/footnotes.md calls definitions root only',
		drop: (seen) =>
			seen.piece.kind === 'definition' &&
			(seen.inside.includes('block_quote') ||
				seen.inside.includes('list_item')),
	},
];

interface Known extends Rule {
	issue: number;
	/** an invariant it breaks in an edited source, and what the smallest such source holds */
	edited?: [Invariant, RegExp];
	/** the smallest source that fails, a fix makes it pass and this entry is then removed */
	example: { site: Site; source: string; loose?: boolean };
}

/** a paragraph that holds only tags, which the root gives no paragraph node */
function only_tags(seen: Seen): boolean {
	return (
		is(seen, 'paragraph') &&
		seen.piece.kids.every((kid) =>
			['html_inline', 'html_void', 'comment_inline', 'mustache'].includes(
				kid.kind
			)
		)
	);
}

/** every known failure, each one takes its pieces out of the documents until its issue is fixed */
const KNOWN: Known[] = [
	{
		issue: 1019,
		what: 'a table does not open inside a block quote',
		drop: (seen) => is(seen, 'table') && within(seen, 'block_quote'),
		example: { site: 'block_quote', source: '| a |\n|---|' },
	},
	{
		issue: 1047,
		what: 'a table in a list item loses its body rows',
		drop: (seen) => is(seen, 'table') && within(seen, 'list_item'),
		example: { site: 'list_item', source: '| a |\n|---|\n| b |' },
	},
	{
		issue: 1048,
		what: 'the line that closes a svelte block or a container directive is read as a table row',
		drop: (seen) =>
			is(seen, 'table') && within(seen, 'svelte_branch', 'directive_container'),
		example: { site: 'svelte_branch', source: '| a |\n|---|' },
	},
	{
		issue: 1021,
		what: 'a svelte block does not open inside a block quote, a list item or a container directive',
		drop: (seen) =>
			is(seen, 'svelte_block') &&
			within(seen, 'block_quote', 'list_item', 'directive_container'),
		example: { site: 'directive_container', source: '{#if a}\nb\n{/if}' },
	},
	{
		issue: 1022,
		what: 'an html comment on its own line gets a paragraph in some containers',
		drop: (seen) =>
			(is(seen, 'comment', 'comment_inline') ||
				(only_tags(seen) && seen.piece.kids[0].kind === 'comment_inline')) &&
			within(seen, 'svelte_branch', 'directive_container', 'list_item'),
		example: { site: 'svelte_branch', source: '<!-- a -->' },
	},
	{
		issue: 1049,
		what: 'a line of only tags keeps its paragraph in a container directive and a loose list item',
		drop: (seen) =>
			(is(seen, 'svelte_tag', 'component') || only_tags(seen)) &&
			(near(seen) === 'directive_container' || near(seen) === 'list_item'),
		example: { site: 'directive_container', source: '{@html a}' },
	},
	{
		issue: 1050,
		what: 'an html element in a block quote holds its lines as inline content',
		drop: (seen) =>
			is(seen, 'html_element', 'raw_element') && within(seen, 'block_quote'),
		example: { site: 'block_quote', source: '<div>\na\n</div>' },
	},
	{
		issue: 1020,
		what: 'an html element does not open inside a list item',
		drop: (seen) =>
			is(seen, 'html_element', 'raw_element', 'html_line') &&
			within(seen, 'list_item'),
		example: { site: 'list_item', source: '<div>\na\n</div>' },
	},
	{
		issue: 1023,
		what: 'a link reference definition is not read inside an html element',
		drop: (seen) => is(seen, 'definition') && within(seen, 'html_element'),
		example: { site: 'html_element', source: '[r]: /u\n\n[a][r]' },
	},
	{
		issue: 1024,
		what: 'an html element in a container directive in a block quote keeps a paragraph',
		drop: (seen) =>
			(is(seen, 'html_line') || only_tags(seen)) &&
			within(seen, 'block_quote') &&
			within(seen, 'directive_container'),
		example: { site: 'block_quote', source: ':::box\n<div>a</div>\n:::' },
	},
	{
		issue: 1025,
		what: 'a container directive left open in a list item runs past the item',
		drop: (seen) =>
			is(seen, 'directive_container') && within(seen, 'list_item'),
		example: { site: 'svelte_branch', source: '- :::box\n  a\n  :::' },
	},
	{
		issue: 1051,
		what: 'a list item that starts with a list marker is an empty item and a second item',
		drop: (seen) =>
			is(seen, 'list') && seen.before === null && near(seen) === 'list_item',
		example: { site: 'list_item', source: '- a' },
	},
	{
		issue: 1052,
		what: 'a comment before text on its line is a block at the root and inline in a container',
		drop: (seen) =>
			(is(seen, 'comment_inline') &&
				seen.before === null &&
				(seen.under.length === 0 ||
					seen.under[seen.under.length - 1] === 'paragraph')) ||
			(seen.piece.join === '\n' && seen.before?.kind === 'comment'),
		example: { site: 'block_quote', source: '<!-- a --> b' },
	},
	{
		issue: 1053,
		what: 'a directive or an html element does not end a paragraph in a block quote',
		drop: (seen) =>
			is(
				seen,
				'directive_leaf',
				'directive_container',
				'html_line',
				'html_element'
			) &&
			seen.piece.join === '\n' &&
			within(seen, 'block_quote'),
		example: { site: 'block_quote', source: 'a\n::leaf' },
	},
	{
		issue: 1056,
		what: 'a thematic break in a list item ends the list or takes the next line into the item',
		drop: (seen) => is(seen, 'thematic_break') && within(seen, 'list_item'),
		example: { site: 'list_item', source: 'a\n---' },
	},
	{
		issue: 1059,
		what: 'the line after a fence that ends a list item is read as text of the item',
		drop: (seen) =>
			is(seen, 'code_fence') &&
			near(seen) === 'list_item' &&
			seen.after === null,
		example: { site: 'svelte_branch', source: '- ```\n  a\n  ```' },
	},
	{
		issue: 1057,
		what: 'a fence does not end a paragraph of a list item in a block quote',
		drop: (seen) =>
			is(seen, 'code_fence') &&
			seen.piece.join === '\n' &&
			within(seen, 'block_quote') &&
			within(seen, 'list_item'),
		example: { site: 'block_quote', source: '- a\n  ```\n  b\n  ```' },
	},
	{
		issue: 1058,
		what: 'an inline element that opens a paragraph and closes on a later line splits the paragraph',
		drop: (seen) =>
			is(seen, 'html_inline') &&
			seen.before === null &&
			inline_text([seen.piece]).includes('\n'),
		example: { site: 'block_quote', source: '<b>a\nb</b> c' },
	},
	{
		issue: 1002,
		what: 'text after a block level element that closes on its line has no paragraph',
		drop: (seen) =>
			(seen.piece.join === '\n' && seen.before?.kind === 'html_line') ||
			// an element that is no block does not end a paragraph, the line in it is then inline
			(is(seen, 'html_element') &&
				seen.piece.join === '\n' &&
				seen.piece.kids.some((kid) => kid.kind === 'html_line')),
		edited: ['placed', /<\/(div|p|section|details)>/],
		example: { site: 'root', source: '<div>a</div>\nb\n' },
	},
	{
		issue: 1060,
		what: 'a directive, a list item or an html element straight after a table is read as a row',
		drop: (seen) =>
			seen.piece.join === '\n' &&
			seen.before?.kind === 'table' &&
			is(
				seen,
				'directive_leaf',
				'directive_container',
				'html_element',
				'html_line',
				'list',
				'svelte_block'
			),
		example: { site: 'html_element', source: '| a |\n|---|\n<div>\nb\n</div>' },
	},
	{
		issue: 1062,
		what: 'an element that holds its own name again is not seen to close on its line',
		drop: (seen) =>
			is(seen, 'html_inline') &&
			seen.before === null &&
			/^<(\w+)[^\n]*<\1/.test(inline_text([seen.piece])),
		example: { site: 'table_cell', source: '<b>`<b>`</b>' },
	},
	{
		issue: 1063,
		what: 'text after a closing fence on its line is lost',
		edited: ['content', /\n`{3,}[ \t]*[^\s`]/],
		example: { site: 'root', source: '```\na\n``` q000\n' },
	},
	{
		issue: 1061,
		what: 'an open tag at the end of a table row reads into the next line, which is then lost',
		edited: ['content', /<\w+\n>/],
		example: {
			site: 'root',
			source: '| a | b |\n|---|---|\n| c | <i\n> | q000 |\n',
		},
	},
	{
		issue: 1054,
		what: 'a comment over lines keeps the quote marker or the indent of each line',
		drop: (seen) =>
			is(seen, 'comment') &&
			seen.piece.form === 1 &&
			within(seen, 'block_quote', 'list_item'),
		example: { site: 'block_quote', source: '<!-- a\nb -->' },
	},
	{
		issue: 1055,
		what: 'a fence in a list item keeps the indent of each line in its code',
		expect: prefixed('list_item', ['code_fence'], 0, (row) =>
			row === '' ? '' : `  ${row}`
		),
		example: { site: 'list_item', source: '```\na\n```' },
	},
];

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
	const before = guard_trips();
	const found =
		only === undefined || only === 'container'
			? container_mismatch(site, rows, is_tight(blocks), RULES)
			: '';
	const out =
		only === 'container'
			? new Map<Invariant, string>()
			: broken_by(`${contained(site, rows).join('\n')}\n`, only);
	if (found !== '') out.set('container', found);
	if (guard_trips() !== before)
		out.set('guard', 'the loop guard stopped the parse');
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

let unwatch: () => void;
beforeAll(() => {
	unwatch = watch_guard();
});
afterAll(() => unwatch());

/** the known failure an edited source shows, read off the smallest source that still fails */
function known_edit(
	source: string,
	invariant: Invariant
): [Known | undefined, string] {
	const least = shrink_text(source, (next) =>
		broken_by(next, invariant).has(invariant)
	);
	const rule = KNOWN.find(
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
const [first_seed, last_seed] = (process.env.PFM_SEEDS ?? '0-100')
	.split('-')
	.map(Number);
const census = process.env.PFM_CENSUS;

describe.skipIf(census !== undefined)('invariance', () => {
	test(
		'a document is the same tree in every container, whole and fed, batch and wire',
		{ timeout: process.env.PFM_SEEDS === undefined ? 30_000 : 0 },
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
			const count = (rule: Known | undefined): void => {
				const key =
					rule === undefined ? 'several' : `#${rule.issue} ${rule.what}`;
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
