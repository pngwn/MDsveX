/** the kinds of target, each the prefix of the ids of its kind */
export type Kind = 'fig' | 'tbl' | 'eq' | 'sec';

export const KINDS: readonly Kind[] = ['fig', 'tbl', 'eq', 'sec'];

/** what one kind reads as, alone and for several */
export type Word = [one: string, many: string];

/** the words of the references, by kind, and what joins the last two numbers */
export interface Words {
	fig: Word;
	tbl: Word;
	eq: Word;
	sec: Word;
	and: string;
}

export const WORDS: Words = {
	fig: ['Figure', 'Figures'],
	tbl: ['Table', 'Tables'],
	eq: ['Equation', 'Equations'],
	sec: ['Section', 'Sections'],
	and: 'and',
};

/** a numbered target as the plugin hands it to components */
export interface Target {
	kind: Kind;
	/** a string, so a later 2.1 fits */
	number: string;
	/** what a caption or a reference reads as, Figure 1 */
	text: string;
}

/** what the plugin writes to plugin_data.numbering, a target under `target:` and its id */
export type NumberingData = Record<`target:${string}`, Target>;

/** one piece of a reference, a link when it has an href */
export interface RefPart {
	text: string;
	href?: string;
}

/** the kind an id names by its prefix, undefined for none */
export function kind_of(id: string): Kind | undefined {
	const colon = id.indexOf(':');
	if (colon === -1) return undefined;
	const prefix = id.slice(0, colon);
	return (KINDS as readonly string[]).includes(prefix)
		? (prefix as Kind)
		: undefined;
}

/** the href of a target, a section is its heading */
export function href_of(id: string, kind: Kind): string {
	return '#' + (kind === 'sec' ? id.slice(4) : id);
}

function joined(items: RefPart[][], and: string): RefPart[] {
	const out: RefPart[] = [];
	items.forEach((item, i) => {
		if (i > 0) out.push({ text: i === items.length - 1 ? ` ${and} ` : ', ' });
		out.push(...item);
	});
	return out;
}

/**
 * what a reference reads as, one target is one link, Figure 1, several of a
 * kind share the word, Figures 1 and 2 with each number a link, a target not
 * known yet reads as ?, and an id of no known kind as written
 *
 * @example
 * ref_parts(['fig:a', 'fig:b'], WORDS, (id) => data['target:' + id]);
 * // [{ text: 'Figures ' }, { text: '1', href: '#fig:a' }, { text: ' and ' }, { text: '2', href: '#fig:b' }]
 */
export function ref_parts(
	ids: readonly string[],
	words: Words,
	target: (id: string) => Target | undefined
): RefPart[] {
	// neighbouring ids of one kind read as one group
	const groups: { kind: Kind | undefined; ids: string[] }[] = [];
	for (const id of ids) {
		const kind = kind_of(id);
		const last = groups[groups.length - 1];
		if (last !== undefined && kind !== undefined && last.kind === kind)
			last.ids.push(id);
		else groups.push({ kind, ids: [id] });
	}
	return joined(
		groups.map(({ kind, ids }) => {
			if (kind === undefined) return [{ text: ids[0] }];
			const word = words[kind];
			const numbers = ids.map((id): RefPart => {
				const found = target(id);
				return found === undefined
					? { text: '?' }
					: { text: found.number, href: href_of(id, kind) };
			});
			if (numbers.length === 1) {
				const [only] = numbers;
				return [{ ...only, text: `${word[0]} ${only.text}` }];
			}
			return [
				{ text: word[1] + ' ' },
				...joined(
					numbers.map((n) => [n]),
					words.and
				),
			];
		}),
		words.and
	);
}
