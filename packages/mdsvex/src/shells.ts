/**
 * static directives rendered at build time, the html a component gives
 * becomes a shell the renderer writes in place of the component, see
 * design/static-directives.md
 */
import type { Shell } from '@mdsvex/render/html-cursor';
import type { ShellNeed } from './compile.js';

/** the vite environment static components load and render in */
export const STATIC_ENVIRONMENT = 'mdsvex_static';

/** the element a hole snippet renders, one per snippet the component is given */
const HOLE = /<mdsvex-hole name="(label|children)"><\/mdsvex-hole>/g;
// svelte writes hydration markers, the shell is markup svelte compiles again
const COMMENT = /<!--[^]*?-->/g;

/**
 * what an asset import gives in the static environment, its id as hex, so
 * the shell turns it back into an import whichever plugin instance loaded it,
 * in a build that is the one of the dev server the build started
 */
export function asset_marker(id: string): string {
	return `__mdsvex_asset_${Buffer.from(id, 'utf8').toString('hex')}__`;
}
const ASSET = /__mdsvex_asset_([0-9a-f]+)__/g;

/** the markup a hole snippet renders */
export function hole_html(name: 'label' | 'children'): string {
	return `<mdsvex-hole name="${name}"></mdsvex-hole>`;
}

/** an error of a static directive, naming it and where it is used */
export class ShellError extends Error {
	readonly directive: string;
	readonly line: number;
	readonly column: number;

	constructor(need: ShellNeed, file: string | undefined, message: string) {
		const at = `${file === undefined ? '' : file + ':'}${need.start.line}:${need.start.column + 1}`;
		super(`[mdsvex] the static directive ${need.name} at ${at} ${message}`);
		this.name = 'ShellError';
		this.directive = need.name;
		this.line = need.start.line;
		this.column = need.start.column;
	}
}

/**
 * the shell of the html a component rendered, each snippet it was given
 * must render exactly once, a snippet left out drops content and one
 * rendered twice repeats it
 */
export function make_shell(
	html: string,
	need: ShellNeed,
	file?: string,
	extra?: {
		/** import statements the shell needs whatever its html holds, its styles */
		imports?: readonly string[];
		/** the number of the local an asset id is imported as, the same for one id in every shell */
		asset?: (id: string) => number;
	}
): Shell {
	const text = html.replace(COMMENT, '');
	const parts: string[] = [];
	const holes: ('label' | 'children')[] = [];
	let from = 0;
	HOLE.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = HOLE.exec(text)) !== null) {
		parts.push(escape_braces(text.slice(from, m.index)));
		holes.push(m[1] as 'label' | 'children');
		from = HOLE.lastIndex;
	}
	parts.push(escape_braces(text.slice(from)));
	const imports = extra?.imports === undefined ? [] : extra.imports.slice();
	const asset = extra?.asset;
	if (asset !== undefined)
		for (let i = 0; i < parts.length; i++) {
			if (parts[i].indexOf('__mdsvex_asset_') === -1) continue;
			parts[i] = parts[i].replace(ASSET, (_, hex: string) => {
				const id = Buffer.from(hex, 'hex').toString('utf8');
				const local = `__mdsvex_asset_${asset(id)}`;
				const line = `import ${local} from ${JSON.stringify(id)};\n`;
				if (!imports.includes(line)) imports.push(line);
				// the expression svelte reads, an attribute value or text alike
				return '{' + local + '}';
			});
		}
	for (const name of ['label', 'children'] as const) {
		const given = name === 'label' ? need.label : need.children;
		const count = holes.filter((h) => h === name).length;
		if (given && count === 0)
			throw new ShellError(
				need,
				file,
				`is given ${name} but its component never renders it, a static component renders each snippet it gets exactly once`
			);
		if (count > 1)
			throw new ShellError(
				need,
				file,
				`renders ${name} ${count} times, a static component renders each snippet it gets exactly once`
			);
	}
	return imports.length === 0
		? { html: parts, holes }
		: { html: parts, holes, imports };
}

/** svelte would read a brace in the html as an expression */
function escape_braces(html: string): string {
	if (html.indexOf('{') === -1 && html.indexOf('}') === -1) return html;
	return html.replace(/[{}]/g, (b) => (b === '{' ? '&#123;' : '&#125;'));
}
