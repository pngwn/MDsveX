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
import type { Invariant, Rule, Site } from './invariance';

function near(seen: Seen): Container {
	return seen.inside[seen.inside.length - 1] ?? 'root';
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

/** the last piece a block ends with, itself when it holds no block */
function last_leaf(piece: Piece): Piece {
	const last = piece.kids[piece.kids.length - 1];
	return piece.kind === 'list' || piece.kind === 'list_item'
		? last === undefined
			? piece
			: last_leaf(last)
		: piece;
}

/** every known failure, each one takes its pieces out of the documents until its issue is fixed */
const KNOWN: Known[] = [
	{
		issue: 1052,
		what: 'a comment before text on its line is a block in every container and inline in a table cell',
		drop: (seen) =>
			(is(seen, 'comment_inline') &&
				seen.before === null &&
				(seen.under.length === 0 ||
					seen.under[seen.under.length - 1] === 'paragraph')) ||
			(seen.piece.join === '\n' && seen.before?.kind === 'comment'),
		example: { site: 'table_cell', source: '<!-- a --> b' },
	},
	{
		issue: 1002,
		what: 'text after a block level element that closes on its line has no paragraph',
		drop: (seen) =>
			// the line after it is text of the same paragraph, a list item passes it on to the line after the list
			(seen.piece.join === '\n' &&
				seen.before !== null &&
				last_leaf(seen.before).kind === 'html_line') ||
			// an element that is no block does not end a paragraph, the line in it is then inline
			(is(seen, 'html_element') &&
				seen.piece.join === '\n' &&
				seen.piece.kids.some((kid) => kid.kind === 'html_line')),
		edited: [
			'placed',
			/<\/(div|p|section|details)>|<(div|p|section|details)\/>/,
		],
		example: { site: 'root', source: '<div>a</div>\nb\n' },
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
		edited: ['content', /\n[> ]*`{3,}[ \t]*[^\s`]/],
		example: { site: 'root', source: '```\na\n``` q000\n' },
	},
	{
		issue: 1061,
		what: 'an open tag or a comment at the end of a table row reads into the next line, which is then lost',
		edited: ['content', /<\w+\n>|<!--\n/],
		example: {
			site: 'root',
			source: '| a | b |\n|---|---|\n| c | <i\n> | q000 |\n',
		},
	},
	{
		issue: 1076,
		what: 'a paragraph that opens at a tag loses its wrapper when a backtick in an autolink or a link destination pairs with one after the element',
		edited: ['placed', /`[>)]<\/\w+>`/],
		example: { site: 'root', source: '<Badge><ht:`></Badge>`\n' },
	},
	{
		issue: 1071,
		what: 'a paragraph that opens at a tag loses its wrapper when fed, with a brace as a link destination in it',
		edited: ['fed', /\]\(\{\)/],
		example: { site: 'root', source: '<b>[]({)</b> a\n\nx\n' },
	},
	{
		issue: 1071,
		what: 'the same over the wire',
		edited: ['wire', /\]\(\{\)/],
		example: { site: 'root', source: '<b>[]({)</b> a\n\nx\n' },
	},
	{
		issue: 1072,
		what: 'a repeated attribute on a tag keeps the last value and loses the first',
		edited: ['content', /\s(\w+)=\S*\s+\1=/],
		example: { site: 'root', source: '<img alt=q000 alt="">\n' },
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
