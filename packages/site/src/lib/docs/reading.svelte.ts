// the page's "show the reading" switch: on, every example on the page is drawn
// as its score; off, as its source. Each example keeps its own toggle, which
// holds until the page's switch is next flipped.
//
// It starts off in Learn and Guides, where the score is a detail, and on in
// Reference and Internals, where it is the point. A reader's choice is kept per
// section, so turning it on in Learn doesn't turn it on in Guides
import { getContext, setContext } from 'svelte';

export type DocsSection = 'learn' | 'guides' | 'plugins' | 'reference' | 'internals';

const DEFAULT_ON: Record<DocsSection, boolean> = {
	learn: false,
	guides: false,
	plugins: false,
	reference: true,
	internals: true,
};

const key = (section: DocsSection) => `mdsvex:docs:reading:${section}`;

export class PageReading {
	on = $state(false);
	/** bumped each time the page's switch is flipped, so an example's own choice from before lapses */
	flips = $state(0);
	section = $state<DocsSection>('learn');

	constructor(section: DocsSection) {
		this.section = section;
		this.on = DEFAULT_ON[section];
	}

	/** a page in another section: its default, or what the reader chose there */
	enter(section: DocsSection) {
		if (section === this.section) return;
		this.section = section;
		this.on = DEFAULT_ON[section];
		this.restore();
	}

	get default() {
		return DEFAULT_ON[this.section];
	}

	/** read the reader's choice; prerendered pages can only do this in the browser */
	restore() {
		try {
			const kept = localStorage.getItem(key(this.section));
			if (kept === 'on' || kept === 'off') this.on = kept === 'on';
		} catch {
			// storage blocked: the section's default stands
		}
	}

	set(on: boolean) {
		this.on = on;
		this.flips++;
		try {
			localStorage.setItem(key(this.section), on ? 'on' : 'off');
		} catch {
			// the choice lasts for the page
		}
	}
}

const CONTEXT = Symbol('docs-reading');

export function provide_reading(section: DocsSection) {
	return setContext(CONTEXT, new PageReading(section));
}

/** the page's switch, or one that stays off for an example outside a page */
export function use_reading(): PageReading {
	return getContext<PageReading>(CONTEXT) ?? new PageReading('learn');
}

/**
 * one example's view: the page's, until its own toggle is used, and the page's
 * again once the page's switch is flipped
 */
export class ExampleReading {
	#page: PageReading;
	#own = $state<{ on: boolean; at: number } | null>(null);

	/** `scored`, it opens on its score whatever the page says, until the page's switch is flipped */
	constructor(page: PageReading, scored = false) {
		this.#page = page;
		if (scored) this.#own = { on: true, at: page.flips };
	}

	get on() {
		const own = this.#own;
		return own && own.at === this.#page.flips ? own.on : this.#page.on;
	}

	set(on: boolean) {
		this.#own = { on, at: this.#page.flips };
	}
}
