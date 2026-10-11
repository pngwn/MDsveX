import type { Bundle } from 'mdsvex';

export interface StepsOptions {
	/**
	 * false leaves the default stylesheet out, the markup and its class names
	 * stay the same
	 */
	css?: boolean;
}

/** a heading depth written as a directive arg, undefined for anything else */
function level_of(arg: unknown): number | undefined {
	if (typeof arg !== 'string' || !/^[1-6]$/.test(arg)) return undefined;
	return Number(arg);
}

/**
 * numbered steps, each heading written directly inside `:::steps` starts a
 * `step` that holds the heading as its label and what follows it as its body
 *
 * the first such heading sets the depth that splits, `(level=3)` names it
 * instead, a heading of any other depth is content of the step it is in
 *
 * @example
 * import { steps } from '@mdsvex/plugin-steps';
 *
 * mdsvex({ plugins: [steps()] });
 */
export function steps(options: StepsOptions = {}): Bundle {
	return {
		name: 'steps',
		module:
			options.css === false
				? '@mdsvex/plugin-steps/directives/unstyled'
				: '@mdsvex/plugin-steps/directives',
		directives: {
			steps: {
				children: {
					heading(node, ctx) {
						const state = ctx.state;
						if (state.level === undefined) {
							state.level =
								level_of(ctx.directive.attrs.args?.level) ?? node.depth;
						}
						if (node.depth !== state.level) return;
						state.step?.close();
						state.step = node.wrap_from('directive_container', {
							name: 'step',
						});
						node.wrap_from('directive_label').close();
					},
				},
			},
			// no handlers, a step can also be written out as :::step[title]
			step: {},
		},
	};
}
