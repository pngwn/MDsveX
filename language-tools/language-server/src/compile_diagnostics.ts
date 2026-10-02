/** what compile rejects or warns about, typescript reports the rest */

import type { LanguageServicePlugin } from '@volar/language-server';
import { root_code } from './root_code';

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
					const root = root_code(context, document);
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
