/** template names, frontmatter keys and values, and directive args, from the props of each component */

import { CompletionItemKind } from '@volar/language-server';
import type {
	CompletionItem,
	LanguageServicePlugin,
} from '@volar/language-server';
import type * as TS from 'typescript';
import type { Provide } from 'volar-service-typescript/lib/plugins/semantic';
import {
	completion_context,
	probe_for,
	props_of,
	template_named,
} from '@mdsvex/language-core';
import type { PfmVirtualCode, Prop } from '@mdsvex/language-core';
import { URI } from 'vscode-uri';
import { root_code } from './root_code';

const SUGGEST = { title: 'suggest', command: 'editor.action.triggerSuggest' };

/** a plain yaml scalar or arg value when it reads back as itself, quoted otherwise */
function written(value: string, plain: RegExp): string {
	return plain.test(value) ? value : JSON.stringify(value);
}

export function create_completions(ts: typeof TS): LanguageServicePlugin {
	return {
		name: 'mdsvex-completions',
		capabilities: {
			// a value follows the space after a colon, args follow the paren, a comma or an equals sign
			completionProvider: { triggerCharacters: [' ', '(', ',', '='] },
		},
		create(context) {
			const props = (
				root: PfmVirtualCode,
				uri: string,
				kind: 'template' | 'directive',
				name: string | undefined,
				template: string | undefined
			): Prop[] => {
				if (name === undefined) return [];
				const probe = probe_for(root.probes, kind, name, template);
				const ls = context.inject<Provide, 'typescript/languageService'>(
					'typescript/languageService'
				);
				const decoded = context.decodeEmbeddedDocumentUri(URI.parse(uri));
				if (!probe || !ls || !decoded) return [];
				const file = context.inject<Provide, 'typescript/documentFileName'>(
					'typescript/documentFileName',
					decoded[0]
				);
				const program = ls.getProgram();
				if (!program || !file) return [];
				// the program types against the typescript volar was built with
				const typed = program as unknown as TS.Program;
				return props_of(ts, typed, file, probe.alias) ?? [];
			};

			return {
				provideCompletionItems(document, position) {
					const root = root_code(context, document);
					if (!root) return;
					const source = document.getText();
					const at = completion_context(
						source,
						document.offsetAt(position),
						root.frontmatter
					);
					if (at === null) return;
					const range = {
						start: document.positionAt(at.range.start),
						end: document.positionAt(at.range.end),
					};
					const named = template_named(source, root.frontmatter);
					const template =
						named === false ? undefined : (named ?? root.template);
					let items: CompletionItem[] = [];

					if (at.kind === 'template') {
						items = root.templates.map((t, i) => ({
							label: t.name,
							kind: CompletionItemKind.EnumMember,
							detail: t.file ?? 'template',
							sortText: String(i).padStart(4, '0'),
							textEdit: { range, newText: t.name },
						}));
						if (items.length !== 0)
							items.push({
								label: 'false',
								kind: CompletionItemKind.Value,
								detail: 'no template',
								sortText: '9999',
								textEdit: { range, newText: 'false' },
							});
					} else if (at.kind === 'frontmatter_key' || at.kind === 'arg_key') {
						const list =
							at.kind === 'frontmatter_key'
								? props(root, document.uri, 'template', template, undefined)
								: props(
										root,
										document.uri,
										'directive',
										at.directive,
										template
									);
						// snippets, never props an author writes
						const reserved =
							at.kind === 'arg_key' && !at.inline
								? ['children', 'label']
								: ['children'];
						const sep = at.kind === 'frontmatter_key' ? ': ' : '=';
						items = list
							.filter(
								(p) =>
									!reserved.includes(p.name) && !at.existing.includes(p.name)
							)
							.map((p) => ({
								label: p.name,
								kind: CompletionItemKind.Property,
								detail: p.optional ? `${p.type} (optional)` : p.type,
								documentation: p.documentation || undefined,
								sortText: (p.optional ? '1' : '0') + p.name,
								textEdit: { range, newText: p.name + sep },
								command: p.values.length !== 0 ? SUGGEST : undefined,
							}));
					} else {
						const list =
							at.kind === 'frontmatter_value'
								? props(root, document.uri, 'template', template, undefined)
								: props(
										root,
										document.uri,
										'directive',
										at.directive,
										template
									);
						const prop = list.find((p) => p.name === at.key);
						// yaml reads these plain scalars back as the same string, args stop at a comma or paren
						const plain =
							at.kind === 'frontmatter_value'
								? /^(?![-?:,[\]{}#&*!|>'"%@`]|true$|false$|null$|~$|[-+.\d])[^:#\n]*$/
								: /^[^\s,)"']+$/;
						items = (prop?.values ?? []).map((v, i) => {
							const literal =
								v === 'true' || v === 'false' || !Number.isNaN(Number(v));
							return {
								label: v,
								kind: CompletionItemKind.EnumMember,
								detail: prop!.type,
								sortText: String(i).padStart(4, '0'),
								textEdit: { range, newText: literal ? v : written(v, plain) },
							};
						});
					}
					return items.length === 0
						? undefined
						: { isIncomplete: false, items };
				},
			};
		},
	};
}
