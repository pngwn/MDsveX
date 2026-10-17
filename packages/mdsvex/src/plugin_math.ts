import type { MathRenderer } from './highlight_run.js';
import type { MathOptions } from './math.js';
import type { MdsvexManifest } from './manifest.js';

/** throws unless the math option of the plugin is one it takes */
export function check_math(written: unknown): void {
	if (written === undefined || written === false) return;
	if (typeof written === 'function') return;
	if (typeof written !== 'object' || written === null)
		throw new Error(
			'[mdsvex] math must be { renderer, options }, a math renderer function or false'
		);
	const { renderer, options } = written as MathOptions;
	if (renderer !== undefined && renderer !== 'temml' && renderer !== 'katex')
		throw new Error(
			`[mdsvex] math.renderer must be 'temml' or 'katex', it is ${JSON.stringify(renderer)}`
		);
	if (
		options !== undefined &&
		(typeof options !== 'object' || options === null)
	)
		throw new Error('[mdsvex] math.options must be an object');
}

/** true when json holds every value, a function such as a katex macro is lost */
function json_safe(value: unknown): boolean {
	if (value === null) return true;
	const type = typeof value;
	if (type === 'string' || type === 'boolean') return true;
	if (type === 'number') return Number.isFinite(value);
	if (type !== 'object') return false;
	if (Array.isArray(value)) return value.every(json_safe);
	const proto = Object.getPrototypeOf(value);
	if (proto !== Object.prototype && proto !== null) return false;
	for (const key in value as object)
		if (!json_safe((value as Record<string, unknown>)[key])) return false;
	return true;
}

/** the math option as the manifest holds it, undefined for the default, which a manifest leaves out */
export function manifest_math(
	written: MathOptions | MathRenderer | false | undefined
): MdsvexManifest['math'] {
	if (written === undefined) return undefined;
	if (written === false) return false;
	if (typeof written === 'function') return { renderer: 'custom' };
	const renderer = written.renderer ?? 'temml';
	const options = written.options as Record<string, unknown> | undefined;
	if (options === undefined || Object.keys(options).length === 0)
		return renderer === 'temml' ? undefined : { renderer };
	return { renderer, options: json_safe(options) ? options : null };
}
