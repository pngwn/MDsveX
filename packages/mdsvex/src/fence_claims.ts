// the fence languages plugins render themselves, which the highlighter never sees

import { custom_config } from './highlight_run.js';
import type { HighlightConfig, HighlightOption } from './highlight_run.js';

/** two plugins claim the fences of one language, which has one owner */
export class FenceOwnerError extends Error {
	language: string;
	/** the names of the two plugins, the earlier first */
	plugins: [string, string];

	constructor(language: string, plugins: [string, string]) {
		super(
			`plugin "${plugins[0]}" and plugin "${plugins[1]}" both claim the fences of language "${language}", ` +
				'a fence language has one owner'
		);
		this.name = 'FenceOwnerError';
		this.language = language;
		this.plugins = plugins;
	}
}

/**
 * adds the fences of a plugin to owners, the message of what is wrong with
 * them, null when nothing is
 */
export function claim_fences(
	fences: unknown,
	plugin: string,
	owners: Map<string, string>
): string | null {
	if (!Array.isArray(fences)) return 'fences must be a list of fence languages';
	for (const lang of fences)
		if (typeof lang !== 'string' || lang === '' || /\s/.test(lang))
			return `fences must be a list of fence languages, ${JSON.stringify(lang)} is not one`;
	// a plugin may name a language twice, a second plugin may not
	for (const lang of new Set(fences as string[])) {
		const owner = owners.get(lang);
		if (owner !== undefined) throw new FenceOwnerError(lang, [owner, plugin]);
		owners.set(lang, plugin);
	}
	return null;
}

/**
 * the highlight option of the compiles of one plugins array, a claimed
 * fence renders plain as with no highlighter, the config is kept for the
 * option it was made from, so a compile allocates nothing
 */
export class FenceClaims {
	private langs: ReadonlySet<string>;
	private given: HighlightOption | undefined = undefined;
	private claimed: HighlightConfig | undefined = undefined;

	constructor(owners: Map<string, string>) {
		this.langs = new Set(owners.keys());
	}

	with(given: HighlightOption | undefined): HighlightOption | undefined {
		// false and undefined highlight nothing, anything else highlight_run rejects
		const base =
			typeof given === 'function'
				? custom_config(given)
				: typeof given === 'object' &&
					  given !== null &&
					  typeof given.block === 'function'
					? given
					: undefined;
		if (base === undefined) return given;
		if (given !== this.given) {
			this.given = given;
			this.claimed = claimed(base, this.langs);
		}
		return this.claimed;
	}
}

function claimed(
	base: HighlightConfig,
	langs: ReadonlySet<string>
): HighlightConfig {
	return {
		block: (code, lang, meta, ctx) =>
			langs.has(lang) ? null : base.block(code, lang, meta, ctx),
		// a code span is never claimed
		inline: (code, lang, ctx) => base.inline(code, lang, ctx),
	};
}
