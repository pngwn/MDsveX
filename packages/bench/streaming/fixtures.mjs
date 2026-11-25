import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// the documents of the words benchmark, not kept in this repository
const PIERRE_COMMIT = '691b8488528e66d9c92f9b708c88a2cdfe01c30e';
const PIERRE_URL = `https://raw.githubusercontent.com/pierrecomputer/pierre/${PIERRE_COMMIT}/packages/words/benchmark/fixtures/`;
const PIERRE = [
	'tiny',
	'assistant-review',
	'assistant-explain',
	'simd',
	'gfm-spec',
];

const OURS = {
	chat: join(here, 'fixtures/chat.md'),
	prose: join(here, '../benchmarks/fixture.md'),
	code: join(here, '../benchmarks/fixture-code.md'),
	tables: join(here, '../benchmarks/fixture-tables.md'),
};

export const DEFAULT_FIXTURES = Object.keys(OURS);
export const PIERRE_FIXTURES = PIERRE.map((name) => 'pierre-' + name);

async function pierre(name) {
	const dir = join(here, 'fixtures/pierre');
	const path = join(dir, name + '.md');
	if (!existsSync(path)) {
		const response = await fetch(PIERRE_URL + name + '.md');
		if (!response.ok)
			throw new Error(`could not fetch ${name}.md, ${response.status}`);
		mkdirSync(dir, { recursive: true });
		writeFileSync(path, await response.text());
	}
	return readFileSync(path, 'utf8');
}

/** the text of a fixture by name, one of pierre is fetched the first time */
export async function load_fixture(name) {
	if (name in OURS) return readFileSync(OURS[name], 'utf8');
	if (PIERRE_FIXTURES.includes(name)) return pierre(name.slice(7));
	throw new Error(
		`no fixture ${name}, there are ${[...DEFAULT_FIXTURES, ...PIERRE_FIXTURES].join(', ')}`
	);
}
