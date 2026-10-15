import type { DirectiveTable, ParsePlugin } from '@mdsvex/parse';
import { toc } from '@mdsvex/plugin-toc';
import { DEFINITIONS } from './stream_docs';

export type StreamDemo = 'toc' | 'deferred';

export interface StreamPlugins {
	plugins: ParsePlugin[];
	directive_handlers: DirectiveTable[];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** the toc plugin as mdsvex gives it to the parser, its parse plugin and its directive under its name */
function toc_plugins(): StreamPlugins {
	const bundle = toc();
	return {
		plugins: [{ name: bundle.name, ...bundle.parse! }],
		directive_handlers: [{ name: bundle.name, directives: bundle.directives! }]
	};
}

/**
 * each :lookup[term] asks for its definition when it closes, the answer lands
 * after a delay, as a fetch would, and patches the directive
 */
function lookup_plugins(): StreamPlugins {
	return {
		plugins: [],
		directive_handlers: [
			{
				name: 'lookup',
				directives: {
					lookup: {
						parse(node, ctx) {
							return () => {
								const term = node.text_content.trim().toLowerCase();
								ctx.defer(node, async (node, ctx) => {
									await sleep(600 + Math.random() * 1200);
									const definition = DEFINITIONS[term] ?? 'no entry';
									node.attrs.args = { ...node.attrs.args, definition };
									ctx.add('looked_up', term);
								});
							};
						}
					}
				}
			}
		]
	};
}

export function stream_plugins(demo: StreamDemo): StreamPlugins {
	if (demo === 'toc') return toc_plugins();
	const { plugins, directive_handlers } = lookup_plugins();
	const contents = toc_plugins();
	return {
		plugins: [...contents.plugins, ...plugins],
		directive_handlers: [...contents.directive_handlers, ...directive_handlers]
	};
}
