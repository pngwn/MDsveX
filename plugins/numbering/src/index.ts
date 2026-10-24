import { fence_meta } from 'mdsvex/compile';
import type { Bundle, NodeView, PluginContext } from 'mdsvex/compile';

import { AND, kind_of, KINDS, mixed_kinds, PREFIXES } from './words.js';
import type { Kind, NumberingData, Prefixes, Target, Word } from './words.js';

export {
	AND,
	href_of,
	kind_of,
	mixed_kinds,
	prefix_arg,
	PREFIXES,
	ref_parts,
} from './words.js';
export type {
	Kind,
	NumberingData,
	Prefixes,
	RefPart,
	RefWords,
	Target,
	Word,
} from './words.js';

/** the name of the package, in one place, the directives module is made from it */
const PACKAGE = '@mdsvex/plugin-numbering';
/** the key of plugin_data */
const NAME = 'numbering';

export interface NumberingOptions {
	/**
	 * the word in front of the numbers of each kind, for one and for several,
	 * a reference with a prefix arg uses that word in its place
	 *
	 * @example
	 * numbering({ prefixes: { fig: ['Fig.', 'Figs.'] } })
	 */
	prefixes?: Partial<Prefixes>;
	/**
	 * what joins the last two numbers of a reference
	 *
	 * @default 'and'
	 */
	and?: string;
	/**
	 * puts the number of each heading in front of it, 1, 1.1, 1.2, off by
	 * default, references to sections read the number either way
	 */
	number_sections?: boolean;
	/**
	 * the depth of the headings numbered 1, 2, 3, deeper ones are 1.1 and
	 * so on, shallower ones are not numbered
	 *
	 * @default 2
	 */
	section_depth?: number;
}

declare module 'mdsvex/compile' {
	interface PluginData {
		numbering?: NumberingData;
	}
}

const BLOCKS = ['directive_container', 'directive_leaf'];

function option_error(message: string): never {
	throw new TypeError(`[${PACKAGE}] ${message}`);
}

function prefixes_of(given: Partial<Prefixes> | undefined): Prefixes {
	if (given === undefined) return PREFIXES;
	if (typeof given !== 'object' || given === null)
		option_error('prefixes must be an object of words by kind');
	const prefixes = { ...PREFIXES };
	for (const [key, value] of Object.entries(given)) {
		if (!(KINDS as readonly string[]).includes(key))
			option_error(
				`prefixes has no kind ${JSON.stringify(key)}, the kinds are ${KINDS.join(', ')}`
			);
		if (
			!Array.isArray(value) ||
			value.length !== 2 ||
			value.some((word) => typeof word !== 'string')
		)
			option_error(
				`prefixes.${key} must be the word for one and for several, such as ['Figure', 'Figures']`
			);
		prefixes[key as Kind] = [value[0], value[1]] as Word;
	}
	return prefixes;
}

/** the ids of a reference, in order */
function ids_of(node: NodeView): string[] {
	return node.text_content
		.split(',')
		.map((id) => id.trim())
		.filter((id) => id !== '');
}

/** the id arg of a directive, undefined for none */
function id_arg(node: NodeView): string | undefined {
	const id = (node.attrs.args as Record<string, string> | undefined)?.id;
	return typeof id === 'string' && id !== '' ? id : undefined;
}

/**
 * numbered figures, tables, equations and sections, and `:ref[fig:x]`
 * references that read as the number and link to the target, as
 * pandoc-crossref does, a figure is the `:::figure` of
 * `@mdsvex/plugin-figures`, a table is `:::table[Caption](id=tbl:x)`, an
 * equation is a math fence with `id=eq:x`
 *
 * @example
 * import { numbering } from '@mdsvex/plugin-numbering';
 *
 * mdsvex({ heading_ids: true, plugins: [figures(), numbering()] });
 */
export function numbering(options: NumberingOptions = {}): Bundle {
	if (typeof options !== 'object' || options === null)
		option_error('the options must be an object');
	const prefixes = prefixes_of(options.prefixes);
	const and = options.and ?? AND;
	if (typeof and !== 'string')
		option_error(`and must be a string, got ${JSON.stringify(and)}`);
	const number_sections = options.number_sections ?? false;
	const depth = options.section_depth ?? 2;
	if (typeof number_sections !== 'boolean')
		option_error(
			`number_sections must be true or false, got ${JSON.stringify(number_sections)}`
		);
	if (!Number.isInteger(depth) || depth < 1 || depth > 6)
		option_error(
			`section_depth must be a heading depth from 1 to 6, got ${JSON.stringify(depth)}`
		);

	/** the next number of a kind, blocks are never revoked so the count can not go wrong */
	function next(ctx: PluginContext, kind: Kind): string {
		const counts: Record<string, number> = (ctx.scratch.counts ??= {});
		return String((counts[kind] = (counts[kind] ?? 0) + 1));
	}

	function target(ctx: PluginContext, id: string, kind: Kind, number: string) {
		const value: Target = {
			kind,
			number,
			text: `${prefixes[kind][0]} ${number}`,
		};
		ctx.set('target:' + id, value);
	}

	/**
	 * a figure or a table with an id of its kind, numbered as it opens, the
	 * owner's handler for a table and an observer of the figure of @mdsvex/plugin-figures
	 */
	function numbered(kind: Kind) {
		return (node: NodeView, ctx: PluginContext) => {
			if (!BLOCKS.includes(node.type)) return;
			const id = id_arg(node);
			if (id === undefined || kind_of(id) !== kind) return;
			const number = next(ctx, kind);
			return () => {
				ctx.id(id, { fixed: true });
				target(ctx, id, kind, number);
			};
		};
	}

	return {
		name: NAME,
		module: `${PACKAGE}/directives`,
		directives: {
			ref: {
				parse(node, ctx) {
					if (node.type !== 'directive_inline') {
						ctx.warn(
							'not_inline',
							'ref is a reference in the text, write :ref[fig:id] inside a paragraph',
							node
						);
						return;
					}
					return () => {
						const ids = ids_of(node);
						if (ids.length === 0) {
							ctx.warn('no_id', ':ref names no id, write :ref[fig:id]', node);
							return;
						}
						if (mixed_kinds(ids))
							ctx.warn(
								'mixed_kinds',
								`:ref[${ids.join(', ')}] names targets of several kinds, each reads with its own word and a prefix is ignored, write one :ref for each kind`,
								node
							);
						// the words of its kinds, so a forward reference can say Figure ?
						const used: Partial<Prefixes> = {};
						for (const id of ids) {
							const kind = kind_of(id);
							if (kind !== undefined) used[kind] = prefixes[kind];
						}
						node.attrs.args = {
							...node.attrs.args,
							ids: JSON.stringify(ids),
							prefixes: JSON.stringify(used),
							and,
						};
					};
				},
			},
			table: { parse: numbered('tbl') },
		},
		parse: {
			// @mdsvex/plugin-figures owns the figure, its args are all this needs
			observe: { figure: { parse: numbered('fig') } },
			code_fence: {
				parse(node, ctx) {
					const meta = fence_meta(node.info);
					if (meta.lang !== 'math') return;
					const id = meta.props?.find(([key]) => key === 'id')?.[1];
					if (typeof id !== 'string' || kind_of(id) !== 'eq') return;
					// the math wrapper takes no attributes, so the id goes on one of its own
					const wrapper = node.wrap_from('html', {
						tag: 'div',
						attributes: { id, class: 'equation' },
					});
					return () => {
						wrapper.close();
						ctx.id(id, { fixed: true });
						const number = next(ctx, 'eq');
						node.append('text', `\\tag{${number}}`);
						target(ctx, id, 'eq', number);
					};
				},
			},
			heading: {
				parse(node, ctx) {
					const at = (node.depth ?? 0) - depth;
					if (at < 0) return;
					const levels: number[] = (ctx.scratch.sections ??= []);
					levels.length = at + 1;
					for (let i = 0; i < at; i++) levels[i] ??= 0;
					levels[at] = (levels[at] ?? 0) + 1;
					const number = levels.join('.');
					if (number_sections) {
						node.prepend('text', ' ');
						node
							.prepend('html', {
								tag: 'span',
								attributes: { class: 'section-number' },
							})
							.append('text', number);
					}
					return () => {
						const id = node.attrs.id;
						if (typeof id === 'string' && id !== '')
							target(ctx, 'sec:' + id, 'sec', number);
					};
				},
			},
			// a reference may come before its target, so only the whole tree says which go nowhere
			document(root, ctx) {
				const data = ctx.data as Record<string, unknown>;
				const walk = (parent: NodeView) => {
					for (let node = parent.first_child; node !== null; node = node.next) {
						const type = node.type;
						if (type === 'text') continue;
						const name = node.attrs.name;
						if (type === 'directive_inline' && name === 'ref') {
							for (const id of ids_of(node)) {
								if (kind_of(id) === undefined)
									ctx.warn(
										'unknown_kind',
										`${id} names no kind of target, an id starts with ${KINDS.map((k) => k + ':').join(', ')}`,
										node
									);
								else if (data['target:' + id] === undefined)
									ctx.warn(
										'unknown_target',
										`${id} names no numbered ${prefixes[kind_of(id)!][0].toLowerCase()} of this document`,
										node
									);
							}
						}
						walk(node);
					}
				};
				walk(root);
			},
		},
	};
}
