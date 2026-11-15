/**
 * the grammar against the parser, see oracle.ts
 *
 * always runs the noise test, noisy documents tokenize with a shallow rule stack
 *
 * by hand, each writes a json of mismatch groups with the smallest source of each
 *   PFM_TM_CENSUS=0-1000 PFM_TM_OUT=out.json  generated documents at the root,
 *                                              edited, and in each container
 *   PFM_TM_FILES=list.txt PFM_TM_OUT=out.json documents named one path a line, every word checked
 *   PFM_TM_GRAMMAR=old.json                   checks another build of the grammar, to compare
 *   PFM_TM_SHOW='["source"]'                  prints the tree, the tokens and the mismatches
 */
import { readFileSync, writeFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import { parse_markdown_svelte } from '../../../packages/parse/src/main';
import {
	CONTAINERS,
	Grammar,
	contained,
	edited,
	rows_of,
} from '../../../packages/parse/test/grammar';
import { print_ast } from '../../../packages/parse/test/print';
import { random } from '../../../packages/parse/test/stream_shape';
import { depths, tokenize, use_grammar } from './grammar';
import { type Mismatch, mismatches } from './oracle';

use_grammar(process.env.PFM_TM_GRAMMAR);

const NOISE = '*_~^`[](){}<>|\\:#-!&"$=+.\'/@ \n\t\0aZ1';

describe('noise', () => {
	test('a noisy document tokenizes and leaves a shallow rule stack', async () => {
		let deepest = 0;
		for (let seed = 0; seed < 150; seed++) {
			const rand = random(seed);
			let doc = rows_of(new Grammar(seed).file()).join('\n');
			for (let i = 0; i < 4; i++) doc = edited(doc, seed * 7 + i);
			let noise = '';
			const n = Math.floor(rand() * 400);
			for (let i = 0; i < n; i++)
				noise += NOISE[Math.floor(rand() * NOISE.length)];
			for (const source of [doc, noise, `${doc}\n${noise}`]) {
				const result = await depths(source);
				deepest = Math.max(deepest, ...result.depths);
			}
		}
		expect(deepest).toBeLessThan(24);
	});
});

/** the smallest source that still has a mismatch of the key, by taking out lines and then characters */
async function shrink(
	source: string,
	key: string,
	every_word: boolean
): Promise<string> {
	const holds = async (s: string) =>
		(await mismatches(s, every_word)).some((m) => m.key === key);
	for (const by of ['\n', '']) {
		if (by === '' && source.length > 2000) break;
		for (let again = true; again; ) {
			again = false;
			const parts = source.split(by);
			for (let i = parts.length - 1; i >= 0 && parts.length > 1; i--) {
				const next = [...parts.slice(0, i), ...parts.slice(i + 1)].join(by);
				if (!(await holds(next))) continue;
				parts.splice(i, 1);
				source = next;
				again = true;
			}
		}
	}
	return source;
}

interface Group {
	count: number;
	where: string;
	line: string;
	source: string;
}

async function report(
	subjects: Iterable<[string, string]>,
	every_word: boolean
): Promise<void> {
	const groups = new Map<string, Group>();
	for (const [where, source] of subjects) {
		for (const m of await mismatches(source, every_word)) {
			const seen = groups.get(m.key);
			if (seen === undefined) {
				groups.set(m.key, { count: 1, where, line: m.line, source });
				continue;
			}
			seen.count++;
			if (source.length < seen.source.length)
				Object.assign(seen, { where, line: m.line, source });
		}
	}
	const out: Record<string, Omit<Group, 'source'> & { smallest: string }> = {};
	let total = 0;
	for (const [key, g] of [...groups].sort((a, b) => b[1].count - a[1].count)) {
		total += g.count;
		out[key] = {
			count: g.count,
			where: g.where,
			line: g.line,
			smallest: await shrink(g.source, key, every_word),
		};
	}
	const json = JSON.stringify({ total, groups: out }, null, 2);
	if (process.env.PFM_TM_OUT) writeFileSync(process.env.PFM_TM_OUT, json);
	else console.log(json);
}

const census = process.env.PFM_TM_CENSUS;
test.runIf(census !== undefined)(
	'census of generated documents',
	async () => {
		const [from, to] = census!.split('-').map(Number);
		function* subjects(): Generator<[string, string]> {
			for (let seed = from; seed < to; seed++) {
				const grammar = new Grammar(seed);
				const whole = rows_of(grammar.file()).join('\n') + grammar.ending();
				yield ['root', whole];
				yield ['edited', edited(whole, seed)];
				const doc = rows_of(new Grammar(seed + 1e6).document());
				for (const site of CONTAINERS)
					yield [site, contained(site, doc).join('\n')];
			}
		}
		await report(subjects(), false);
	},
	3_600_000
);

const files = process.env.PFM_TM_FILES;
test.runIf(files !== undefined)(
	'census of files',
	async () => {
		function* subjects(): Generator<[string, string]> {
			for (const file of readFileSync(files!, 'utf8').split('\n')) {
				if (file !== '') yield [file, readFileSync(file, 'utf8')];
			}
		}
		await report(subjects(), true);
	},
	3_600_000
);

const show = process.env.PFM_TM_SHOW;
test.runIf(show !== undefined)('show', async () => {
	for (const source of JSON.parse(show!) as string[]) {
		const lines = [`=== ${JSON.stringify(source)}`];
		lines.push(print_ast(parse_markdown_svelte(source).nodes, source));
		for (const t of await tokenize(source))
			lines.push(
				`  ${JSON.stringify(t.text).padEnd(24)} ${t.scopes.join(' ')}`
			);
		const found: Mismatch[] = await mismatches(source, true);
		for (const m of found) lines.push(`  ${m.word}: ${m.key}`);
		console.log(lines.join('\n'));
	}
});
