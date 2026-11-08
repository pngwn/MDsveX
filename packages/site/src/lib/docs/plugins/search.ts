// search over the words each plugin is made of: its name, the syntax it reads,
// its directives, its options and their docs, what it says it does, and the
// concern it serves. Small enough to run on every keystroke, and each hit says
// why it matched, so a search for `rel` shows the option it found
import type { Term } from './types';

const WEIGHT: Record<Term['field'], number> = {
	name: 10,
	syntax: 8,
	directive: 7,
	package: 6,
	option: 6,
	reads: 4,
	keyword: 4,
	concern: 3,
	description: 2,
	doc: 1,
};

/** how a term is said beside a hit */
const SAID: Record<Term['field'], string> = {
	name: 'name',
	syntax: 'syntax',
	directive: 'directive',
	package: 'package',
	option: 'option',
	reads: 'what it acts on',
	keyword: 'keyword',
	concern: 'concern',
	description: 'description',
	doc: 'option',
};

export interface Hit {
	score: number;
	/** the query, words together, is in one term: `new tab` in `new_tab_label` */
	phrase: boolean;
	/** the best term for each word of the query, said as `option rel` */
	why: { field: string; text: string }[];
}

export const words_of = (query: string) => query.toLowerCase().split(/\s+/).filter(Boolean);

/** underscores and hyphens read as spaces, so `reading time` is `reading_time` */
const loose = (text: string) => text.toLowerCase().replace(/[_-]+/g, ' ');

function match(word: string, term: Term): number {
	const text = term.text.toLowerCase();
	const w = WEIGHT[term.field];
	if (text === word) return w * 3;
	if (text.startsWith(word)) return w * 2;
	// a word start inside, `heading_ids` finds `ids`, `tabs(group=…)` finds `group`
	const at = text.indexOf(word);
	if (at < 0) return 0;
	return /[\w]/.test(text[at - 1] ?? '') && /\w/.test(word[0]) ? w * 0.5 : w;
}

/** a plugin's hit for the query, null when a word of it matches nothing */
export function hit(words: string[], terms: Term[]): Hit | null {
	let score = 0;
	const why: Hit['why'] = [];
	for (const word of words) {
		let best = 0;
		let found: Term | null = null;
		for (const term of terms) {
			const s = match(word, term);
			if (s > best) [best, found] = [s, term];
		}
		if (!found) return null;
		score += best;
		// a long doc is said by its option's name, the part before the colon
		const text = found.field === 'doc' ? found.text.slice(0, found.text.indexOf(':')) : found.text;
		if (!why.some((y) => y.text === text)) why.push({ field: SAID[found.field], text });
	}
	const phrase = words.length > 1 && terms.some((t) => loose(t.text).includes(loose(words.join(' '))));
	return { score: phrase ? score * 2 : score, phrase, why };
}

/**
 * the hits worth showing: when some plugin has the whole phrase, only those,
 * and none that scores under a quarter of the best, a word found deep in an
 * option's doc beside one that is the option's name
 */
export function keep<T extends { hit: Hit }>(found: T[]): T[] {
	const phrased = found.some((f) => f.hit.phrase) ? found.filter((f) => f.hit.phrase) : found;
	const best = Math.max(0, ...phrased.map((f) => f.hit.score));
	return phrased.filter((f) => f.hit.score >= best / 4);
}
