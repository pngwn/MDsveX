import type { Bundle, BundleDirective } from 'mdsvex/compile';

/** the kinds of callout, the five alerts of github */
export type CalloutKind = 'note' | 'tip' | 'important' | 'warning' | 'caution';

export interface CalloutsOptions {
	/**
	 * the title of a callout written with no label, by kind, for a site in
	 * another language, a kind left out keeps its english title
	 */
	titles?: Partial<Record<CalloutKind, string>>;
	/**
	 * false leaves the default stylesheet out, the markup and its class names
	 * stay the same
	 */
	css?: boolean;
}

const KINDS: readonly CalloutKind[] = [
	'note',
	'tip',
	'important',
	'warning',
	'caution',
];

const TITLES: Record<CalloutKind, string> = {
	note: 'Note',
	tip: 'Tip',
	important: 'Important',
	warning: 'Warning',
	caution: 'Caution',
};

export class CalloutsError extends Error {
	readonly code: string;
	constructor(code: string, message: string) {
		super(`[@mdsvex/plugin-callouts] ${message}`);
		this.name = 'CalloutsError';
		this.code = code;
	}
}

function titles_of(
	given: CalloutsOptions['titles']
): Record<CalloutKind, string> {
	if (given === undefined) return TITLES;
	if (typeof given !== 'object' || given === null) {
		throw new CalloutsError(
			'option',
			'titles must be an object of titles by kind'
		);
	}
	const titles = { ...TITLES };
	for (const key of Object.keys(given)) {
		if (!KINDS.includes(key as CalloutKind)) {
			throw new CalloutsError(
				'option',
				`titles has a key ${JSON.stringify(key)} that is no kind of callout, the kinds are ${KINDS.join(', ')}`
			);
		}
		const title = given[key as CalloutKind];
		if (title === undefined) continue;
		if (typeof title !== 'string' || title.trim() === '') {
			throw new CalloutsError(
				'option',
				`titles.${key} must be a string that is not empty`
			);
		}
		titles[key as CalloutKind] = title;
	}
	return titles;
}

/** a callout of one kind, the component learns its kind and default title from its args */
function callout(kind: CalloutKind, title: string): BundleDirective {
	return {
		parse(node, ctx) {
			if (node.type !== 'directive_container') {
				ctx.warn(
					'not_container',
					`${kind} is a callout around blocks, write it as :::${kind} on a line of its own and close it with :::`,
					node
				);
			}
			// a block directive has its args at the open, so a streamed page shows the kind at once
			node.attrs.args = { ...node.attrs.args, kind, title };
		},
		// the label is the title when there is one, the default title of the kind otherwise
		text: (args, label) => (label === '' ? args.title : label),
	};
}

/**
 * callouts, `:::note`, `:::tip`, `:::important`, `:::warning` and
 * `:::caution`, a box with a title and an icon around what is written inside,
 * the bracket text is a custom title, `:::warning[Breaking change]`
 *
 * the components render at build time and ship no javascript
 *
 * @example
 * import { callouts } from '@mdsvex/plugin-callouts';
 *
 * mdsvex({ plugins: [callouts()] });
 */
export function callouts(options: CalloutsOptions = {}): Bundle {
	const titles = titles_of(options.titles);
	const directives: Record<string, BundleDirective> = {};
	for (const kind of KINDS) directives[kind] = callout(kind, titles[kind]);
	return {
		name: 'callouts',
		module:
			options.css === false
				? '@mdsvex/plugin-callouts/directives/unstyled'
				: '@mdsvex/plugin-callouts/directives',
		directives,
	};
}
