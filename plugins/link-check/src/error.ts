/** the name of the package, in one place, error messages are made from it */
export const PACKAGE = '@mdsvex/plugin-link-check';

export type LinkCheckErrorCode = 'option' | 'no_reader' | 'broken';

/** a link that goes nowhere, as a strict check lists it */
export interface BrokenLink {
	/** the url as the document has it */
	href: string;
	/** what is wrong with it, the message of its warning */
	message: string;
	/** where the link is, from 1, undefined over the wire */
	line?: number;
	/** from 0, undefined over the wire */
	column?: number;
}

/**
 * code `option` for an option of the wrong shape, `no_reader` for a
 * document that links to another in a compile that can not read files,
 * `broken` for a strict check that found links that go nowhere, which
 * `links` lists
 */
export class LinkCheckError extends Error {
	code: LinkCheckErrorCode;
	/** the links that go nowhere, in document order, empty for any other code */
	links: BrokenLink[];

	constructor(
		code: LinkCheckErrorCode,
		message: string,
		links: BrokenLink[] = []
	) {
		super(`[${PACKAGE}] ${message}`);
		this.name = 'LinkCheckError';
		this.code = code;
		this.links = links;
	}
}
