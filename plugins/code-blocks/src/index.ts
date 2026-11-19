import type { Bundle } from 'mdsvex/compile';

export interface CodeBlocksOptions {
	/**
	 * false leaves the default stylesheet out, the markup and its class names
	 * stay the same
	 */
	css?: boolean;
}

/**
 * replaces `pre` with a code block that has a copy button, the title and
 * caption of the fence above and below it, a fence with the `nocopy` flag
 * gets no button
 *
 * @example
 * import { code_blocks } from '@mdsvex/plugin-code-blocks';
 *
 * mdsvex({ plugins: [code_blocks()] });
 */
export function code_blocks(options: CodeBlocksOptions = {}): Bundle {
	return {
		name: 'code_blocks',
		components: {
			specifier:
				options.css === false
					? '@mdsvex/plugin-code-blocks/components/unstyled'
					: '@mdsvex/plugin-code-blocks/components',
			names: ['pre'],
		},
	};
}
