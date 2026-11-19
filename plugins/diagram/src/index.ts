import { fence_meta } from 'mdsvex/compile';
import type { Bundle } from 'mdsvex/compile';

import {
	DiagramError,
	installed,
	load_pele,
	pick_engine,
	type DiagramEngine,
} from './engine.js';

export { DiagramError } from './engine.js';
export type { DiagramEngine, DiagramErrorCode } from './engine.js';

export interface DiagramOptions {
	/**
	 * auto, the default, draws with pele when it is installed and with mermaid
	 * otherwise, pele draws at build time and mermaid in the browser
	 */
	engine?: DiagramEngine;
	/**
	 * false leaves the default stylesheet out, the markup and its class names
	 * stay the same
	 */
	css?: boolean;
	/**
	 * mermaid only, the theme of every diagram, by default dark for a reader
	 * whose system is dark and default otherwise
	 */
	theme?: string;
	/**
	 * pele only, the render options of every diagram, such as fontFamily or
	 * links, the plugin sets idPrefix for each
	 *
	 * @example
	 * diagram({ pele: { fontFamily: 'Inter, sans-serif', images: false } })
	 */
	pele?: Record<string, unknown>;
	/**
	 * pele only, true fails the build at a diagram pele can not draw, by
	 * default that is a warning and the diagram shows its source
	 */
	strict?: boolean;
}

/**
 * draws each `mermaid` fence as a diagram, with pele at build time or with
 * mermaid in the browser, the fence is wrapped in a `diagram` directive so it
 * still renders as plain code, through any `pre`, as the source and the
 * fallback, the plugin claims the language so it is never highlighted
 *
 * pele and mermaid are optional peer dependencies, install the one to use
 *
 * @example
 * import { diagram } from '@mdsvex/plugin-diagram';
 *
 * mdsvex({ plugins: [diagram()] });
 */
export function diagram(options: DiagramOptions = {}): Bundle {
	const engine = pick_engine(options.engine ?? 'auto', installed);
	const pele = engine === 'pele' ? load_pele() : undefined;
	const { theme, strict } = options;
	return {
		name: 'diagram',
		module:
			'@mdsvex/plugin-diagram/' +
			engine +
			(options.css === false ? '/unstyled' : ''),
		directives: { diagram: {} },
		fences: ['mermaid'],
		parse: {
			code_fence: {
				parse(node, ctx) {
					const { lang, title, caption } = fence_meta(node.info);
					if (lang !== 'mermaid') return;
					const args: Record<string, string> = {};
					if (title) args.title = title;
					if (caption) args.caption = caption;
					if (pele === undefined && theme) args.theme = theme;
					const wrapper = node.wrap_from('directive_container', {
						name: 'diagram',
						args,
					});
					wrapper.close();
					// the code has arrived once the fence closes
					return () => {
						const code = node.text_content;
						if (pele === undefined) {
							wrapper.attrs.args = { ...args, code };
							return;
						}
						try {
							const { svg } = pele.render(code, {
								...options.pele,
								// the ids inside the svg start with it, so two diagrams never share one
								idPrefix: ctx.id('diagram'),
							});
							wrapper.attrs.args = { ...args, svg };
						} catch (error) {
							const reason = (error as Error).message;
							if (strict) {
								const line = node.position?.start.line;
								throw new DiagramError(
									'render',
									`the diagram${line === undefined ? '' : ` at line ${line}`} could not be drawn: ${reason}`
								);
							}
							ctx.warn(
								'diagram_error',
								`the diagram could not be drawn, its source is shown: ${reason}`,
								node
							);
							wrapper.attrs.args = { ...args, error: reason };
						}
					};
				},
			},
		},
	};
}
