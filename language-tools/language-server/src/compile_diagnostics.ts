/** what compile rejects or warns about, typescript reports the rest */

import type { LanguageServicePlugin } from '@volar/language-server';
import type { PfmVirtualCode } from '@mdsvex/language-core';
import { URI } from 'vscode-uri';

const ERROR = 1;
const WARNING = 2;

export function create_compile_diagnostics(): LanguageServicePlugin {
	return {
		name: 'mdsvex-compile',
		capabilities: {
			diagnosticProvider: {
				interFileDependencies: false,
				workspaceDiagnostics: false,
			},
		},
		create(context) {
			return {
				provideDiagnostics(document) {
					// the pfm root code, whose offsets are those of the document
					if (document.languageId !== 'pfm') return;
					const decoded = context.decodeEmbeddedDocumentUri(
						URI.parse(document.uri)
					);
					if (decoded === undefined) return;
					const root = context.language.scripts.get(decoded[0])?.generated
						?.root as PfmVirtualCode | undefined;
					if (root?.diagnostics === undefined) return;
					return root.diagnostics.map((d) => ({
						range: {
							start: document.positionAt(d.start),
							end: document.positionAt(d.end),
						},
						message: d.message,
						severity: d.severity === 'error' ? ERROR : WARNING,
						source: 'mdsvex',
					}));
				},
			};
		},
	};
}
