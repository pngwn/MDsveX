/** the configured template names and false as the value of the frontmatter template key */

import { CompletionItemKind } from '@volar/language-server';
import type {
	CompletionItem,
	LanguageServicePlugin,
} from '@volar/language-server';
import { template_value_at } from '@mdsvex/language-core';
import { root_code } from './root_code';

export function create_template_completions(): LanguageServicePlugin {
	return {
		name: 'mdsvex-template',
		capabilities: {
			// the value starts after the space that follows the colon
			completionProvider: { triggerCharacters: [' '] },
		},
		create(context) {
			return {
				provideCompletionItems(document, position) {
					const root = root_code(context, document);
					if (!root || root.frontmatter === null || root.templates.length === 0)
						return;
					const source = document.getText();
					const offset = document.offsetAt(position);
					const value = template_value_at(source, offset, root.frontmatter);
					if (value === null) return;
					const range = {
						start: document.positionAt(value.start),
						end: document.positionAt(value.end),
					};
					const items: CompletionItem[] = root.templates.map((t, i) => ({
						label: t.name,
						kind: CompletionItemKind.EnumMember,
						detail: t.file ?? 'template',
						sortText: String(i).padStart(4, '0'),
						textEdit: { range, newText: t.name },
					}));
					items.push({
						label: 'false',
						kind: CompletionItemKind.Value,
						detail: 'no template',
						sortText: '9999',
						textEdit: { range, newText: 'false' },
					});
					return { isIncomplete: false, items };
				},
			};
		},
	};
}
