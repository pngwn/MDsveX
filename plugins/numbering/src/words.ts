/** the kinds of target, each the prefix of the ids of its kind */
export type Kind = 'fig' | 'tbl' | 'eq' | 'sec';

export const KINDS: readonly Kind[] = ['fig', 'tbl', 'eq', 'sec'];

/** what one kind reads as, alone and for several */
export type Word = [one: string, many: string];

/** the word in front of the numbers of each kind */
export type Prefixes = Record<Kind, Word>;

export const PREFIXES: Prefixes = {
	fig: ['Figure', 'Figures'],
	tbl: ['Table', 'Tables'],
	eq: ['Equation', 'Equations'],
	sec: ['Section', 'Sections'],
};

/** what joins the last two numbers of a reference */
export const AND = 'and';

/** a numbered target as the plugin hands it to components */
export interface Target {
	kind: Kind;
	/** a string, so a later 2.1 fits */
	number: string;
	/** what a caption reads as, Figure 1 */
	text: string;
}

/** what the plugin writes to plugin_data.numbering, a target under `target:` and its id */
export type NumberingData = Record<`target:${string}`, Target>;

/** one piece of a reference, a link when it has an href */
export interface RefPart {
	text: string;
	href?: string;
}

/** how a reference reads, the defaults and what the author wrote */
export interface RefWords {
	prefixes: Prefixes;
	and: string;
	/** the prefix arg, a word used as written, false for none, undefined for the default */
	prefix?: string | false;
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

/** the prefix arg as written, only the literal false turns the word off */
export function prefix_arg(value: unknown): string | false | undefined {
	if (typeof value !== 'string') return undefined;
	return value === 'false' ? false : value;
}

/** true when the ids name targets of more than one kind */
export function mixed_kinds(ids: readonly string[]): boolean {
	const kinds = new Set(ids.map(kind_of));
	kinds.delete(undefined);
	return kinds.size > 1;
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
 * what a reference reads as, one target is one link with its word, Figure 1,
 * several of a kind share the word, Figures 1 and 2 with each number a link,
 * a target not known yet reads as ?, an id of no known kind as written, a
 * written prefix replaces the word and false leaves it out, ids of several
 * kinds read each kind with its own word
 *
 * @example
 * ref_parts(['fig:a', 'fig:b'], { prefixes: PREFIXES, and: AND }, (id) => data['target:' + id]);
 * // [{ text: 'Figures ' }, { text: '1', href: '#fig:a' }, { text: ' and ' }, { text: '2', href: '#fig:b' }]
 */
export function ref_parts(
	ids: readonly string[],
	words: RefWords,
	target: (id: string) => Target | undefined
): RefPart[] {
	// one written word can not name two kinds
	const prefix =
		typeof words.prefix === 'string' && mixed_kinds(ids)
			? undefined
			: words.prefix;
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
			const many = ids.length > 1;
			const word =
				prefix === false
					? ''
					: prefix === undefined
						? words.prefixes[kind][many ? 1 : 0]
						: prefix;
			const lead = word === '' ? '' : word + ' ';
			const numbers = ids.map((id): RefPart => {
				const found = target(id);
				return found === undefined
					? { text: '?' }
					: { text: found.number, href: href_of(id, kind) };
			});
			if (!many) return [{ ...numbers[0], text: lead + numbers[0].text }];
			const list = joined(
				numbers.map((n) => [n]),
				words.and
			);
			return lead === '' ? list : [{ text: lead }, ...list];
		}),
		words.and
	);
}
