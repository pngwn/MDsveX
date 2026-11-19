import type { Bundle, TextRun } from 'mdsvex/compile';

import { TABLE } from './table.js';

const PACKAGE = '@mdsvex/plugin-emoji';

const NAME = 'emoji';

export interface EmojiOptions {
	/**
	 * the shortcodes, each name without its colons and what it becomes, in
	 * place of the built in table
	 */
	table?: Record<string, string>;
	/** more shortcodes on top of the table, `null` takes one out */
	extend?: Record<string, string | null>;
	/**
	 * wraps each emoji in `<span role="img" aria-label="...">`, one from a
	 * shortcode and one typed as a character
	 *
	 * `true` labels it with its description, `party popper` for `:tada:`, a
	 * function gives the label, and an emoji with no label gets no `role`
	 */
	label?:
		| boolean
		| ((emoji: string, name: string | undefined) => string | undefined);
	/**
	 * attributes for a `<span>` around each emoji, such as a class, they
	 * replace a default of the same name
	 */
	attrs?: Record<string, string>;
}

/** an option the plugin cannot use */
export class EmojiError extends Error {
	code: 'option';

	constructor(message: string) {
		super(`[${PACKAGE}] ${message}`);
		this.name = 'EmojiError';
		this.code = 'option';
	}
}

const SHORTCODE = /^[A-Za-z0-9_+-]+$/;

let builtin: Map<string, string> | undefined;
let descriptions: Map<string, string> | undefined;

function shortcodes(): Map<string, string> {
	if (builtin !== undefined) return builtin;
	builtin = new Map();
	for (const line of TABLE.split('\n')) {
		const [emoji, names] = line.split('\t');
		for (const name of names.split(' ')) builtin.set(name, emoji);
	}
	return builtin;
}

/** only a build that labels reads the descriptions */
function described(): Map<string, string> {
	if (descriptions !== undefined) return descriptions;
	descriptions = new Map();
	for (const line of TABLE.split('\n')) {
		const [emoji, , description] = line.split('\t');
		descriptions.set(plain(emoji), description);
	}
	return descriptions;
}

/** without the variation selector and the skin tone, which do not change what an emoji is called */
function plain(emoji: string): string {
	return emoji.replace(/\ufe0f|\ud83c[\udffb-\udfff]/g, '');
}

function entries(option: string, value: unknown): [string, unknown][] {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new EmojiError(
			`${option} must be an object of shortcodes, got ${value === null ? 'null' : Array.isArray(value) ? 'an array' : typeof value}`
		);
	}
	const out = Object.entries(value);
	for (const [name] of out) {
		if (!SHORTCODE.test(name)) {
			throw new EmojiError(
				`${option} has the shortcode ${JSON.stringify(name)}, a shortcode is letters, digits, _, + and -, without its colons`
			);
		}
	}
	return out;
}

function table_of(options: EmojiOptions): Map<string, string> {
	const { table, extend } = options;
	let out = shortcodes();
	if (table !== undefined) {
		out = new Map();
		for (const [name, emoji] of entries('table', table)) {
			if (typeof emoji !== 'string' || emoji === '') {
				throw new EmojiError(
					`table.${name} must be the text the shortcode becomes, got ${JSON.stringify(emoji)}`
				);
			}
			out.set(name, emoji);
		}
	}
	if (extend !== undefined) {
		out = new Map(out);
		for (const [name, emoji] of entries('extend', extend)) {
			if (emoji === null) out.delete(name);
			else if (typeof emoji === 'string' && emoji !== '') out.set(name, emoji);
			else {
				throw new EmojiError(
					`extend.${name} must be the text the shortcode becomes, or null to take it out, got ${JSON.stringify(emoji)}`
				);
			}
		}
	}
	return out;
}

const WORD = /[\p{L}\p{N}]/u;

/** every emoji typed as a character, undefined where the engine has no v flag */
function typed_pattern(): RegExp | undefined {
	try {
		return new RegExp('\\p{RGI_Emoji}', 'gv');
	} catch {
		return undefined;
	}
}

/**
 * emoji shortcodes, `:tada:` becomes the emoji
 *
 * a name the table does not have stays as written, and so does one that
 * touches a letter or a digit, as in `10:30:00`
 *
 * @example
 * import { emoji } from '@mdsvex/plugin-emoji';
 *
 * mdsvex({ plugins: [emoji()] });
 */
export function emoji(options: EmojiOptions = {}): Bundle {
	const table = table_of(options);
	const { label, attrs } = options;
	if (
		label !== undefined &&
		typeof label !== 'boolean' &&
		typeof label !== 'function'
	) {
		throw new EmojiError(
			`label must be true, false or a function, got ${typeof label}`
		);
	}
	if (
		attrs !== undefined &&
		(attrs === null || typeof attrs !== 'object' || Array.isArray(attrs))
	) {
		throw new EmojiError('attrs must be an object of attributes');
	}
	const labelled = label !== undefined && label !== false;
	const wrapped = labelled || attrs !== undefined;
	const typed = wrapped ? typed_pattern() : undefined;

	function label_of(
		emoji: string,
		name: string | undefined
	): string | undefined {
		if (typeof label === 'function') {
			const given = label(emoji, name);
			return typeof given === 'string' && given !== '' ? given : undefined;
		}
		const known = described().get(plain(emoji));
		if (known !== undefined) return known;
		// a shortcode of the caller, its name is all there is to say
		return name === undefined ? undefined : name.replace(/[_-]+/g, ' ').trim();
	}

	function put(
		run: TextRun,
		start: number,
		end: number,
		emoji: string,
		name: string | undefined
	): void {
		const said = labelled ? label_of(emoji, name) : undefined;
		if (said === undefined && attrs === undefined) {
			// a typed emoji with nothing to add is left as the author typed it
			if (name !== undefined) run.replace(start, end, 'text', emoji);
			return;
		}
		const attributes: Record<string, string> =
			said === undefined
				? { ...attrs }
				: { role: 'img', 'aria-label': said, ...attrs };
		run
			.replace(start, end, 'html', { tag: 'span', attributes })
			.append('text', emoji);
	}

	return {
		name: NAME,
		parse: {
			sequential: true,
			text(run) {
				const text = run.text;
				let from = text.indexOf(':');
				while (from !== -1) {
					const to = text.indexOf(':', from + 1);
					if (to === -1) break;
					const name = text.slice(from + 1, to);
					const emoji = SHORTCODE.test(name) ? table.get(name) : undefined;
					if (
						emoji === undefined ||
						(from > 0 && WORD.test(text[from - 1])) ||
						(to + 1 < text.length && WORD.test(text[to + 1]))
					) {
						// the closing colon may open the next shortcode
						from = to;
						continue;
					}
					put(run, from, to + 1, emoji, name);
					from = text.indexOf(':', to + 1);
				}
				if (typed === undefined) return;
				typed.lastIndex = 0;
				for (const match of text.matchAll(typed)) {
					put(
						run,
						match.index,
						match.index + match[0].length,
						match[0],
						undefined
					);
				}
			},
		},
	};
}
