import { readFileSync } from 'node:fs';

import { compile, LinkReferenceError } from '../src/main';

/**
 * false for a parser fixture that holds a reference with no definition, the
 * parser reads it as a link with no url and a compile rejects the document
 */
export function references_defined(file: string): boolean {
	try {
		compile(readFileSync(file, 'utf8'));
	} catch (e) {
		if (e instanceof LinkReferenceError) return false;
	}
	return true;
}
