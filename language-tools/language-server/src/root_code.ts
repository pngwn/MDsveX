import type { LanguageServiceContext } from '@volar/language-server';
import type { PfmVirtualCode } from '@mdsvex/language-core';
import { URI } from 'vscode-uri';

/** the pfm root code of a document, whose offsets are those of the source */
export function root_code(
	context: LanguageServiceContext,
	document: { uri: string; languageId: string }
): PfmVirtualCode | undefined {
	if (document.languageId !== 'pfm') return;
	const decoded = context.decodeEmbeddedDocumentUri(URI.parse(document.uri));
	if (decoded === undefined) return;
	return context.language.scripts.get(decoded[0])?.generated?.root as
		| PfmVirtualCode
		| undefined;
}
