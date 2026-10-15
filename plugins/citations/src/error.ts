/** the name of the package, in one place, error messages and the directives module are made from it */
export const PACKAGE = '@mdsvex/plugin-citations';

export type CitationsErrorCode = 'option' | 'bibliography' | 'no_bibliography';

/**
 * code `option` for an option of the wrong shape, `bibliography` for a file
 * that is no CSL JSON or a frontmatter key that names none, `no_bibliography`
 * for a document that cites with no file named or no way to read it
 */
export class CitationsError extends Error {
	code: CitationsErrorCode;

	constructor(code: CitationsErrorCode, message: string) {
		super(`[${PACKAGE}] ${message}`);
		this.name = 'CitationsError';
		this.code = code;
	}
}
