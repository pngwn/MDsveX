/**
 * what a static component can never do, it renders once at build time and
 * ships no code, so a handler, a binding or a context read is dead, only
 * the file of the component is read, see design/static-directives.md
 */

/** one construct of a static component that never runs, offsets in its file */
export interface StaticProblem {
	/** as written, onclick, bind:value, {@attach}, getContext() */
	what: string;
	line: number;
	column: number;
}

/** the context functions of svelte, a static component has no page to read */
const CONTEXT = new Set([
	'getContext',
	'setContext',
	'hasContext',
	'getAllContexts',
	'createContext',
]);

/** the elements that take event attributes, onclick on a component is a prop */
const ELEMENTS = new Set([
	'RegularElement',
	'SvelteElement',
	'SvelteWindow',
	'SvelteDocument',
	'SvelteBody',
]);

// a style block parses as css, a preprocessed one such as scss may not
const STYLE = /<style\b[^]*?<\/style\s*>/gi;

const checked = new Map<string, { code: string; problems: StaticProblem[] }>();

/**
 * what never runs in a static svelte component, empty for none, for code
 * svelte can not parse and for a file that is no svelte component, the
 * render reports what it can not compile
 */
export async function static_problems(
	file: string,
	code?: string
): Promise<StaticProblem[]> {
	if (!file.endsWith('.svelte')) return [];
	if (code === undefined) {
		const fs = await import('node:fs/promises');
		code = await fs.readFile(file, 'utf8');
	}
	const hit = checked.get(file);
	if (hit !== undefined && hit.code === code) return hit.problems;
	const problems = await find_problems(code);
	checked.set(file, { code, problems });
	return problems;
}

/** an error listing what never runs in a static component, null for none */
export async function check_static(
	file: string,
	code?: string
): Promise<Error | null> {
	const problems = await static_problems(file, code);
	if (problems.length === 0) return null;
	const list = problems
		.map((p) => `  ${p.what} at ${file}:${p.line}:${p.column + 1}`)
		.join('\n');
	const error = new Error(
		`[mdsvex] the static component ${file} uses what never runs in static output:\n` +
			list +
			'\na static directive renders once at build time and ships no code, ' +
			'rename the file without .static to render it live'
	);
	error.name = 'StaticComponentError';
	return error;
}

async function find_problems(code: string): Promise<StaticProblem[]> {
	const { parse } = await import('svelte/compiler');
	// the same length, so every offset holds
	const source = code.replace(STYLE, (s) => s.replace(/[^\n]/g, ' '));
	let ast: any;
	try {
		ast = parse(source, { modern: true });
	} catch {
		return [];
	}
	const found: { what: string; at: number }[] = [];
	/** local name to the svelte function it imports */
	const context = new Map<string, string>();
	for (const script of [ast.module, ast.instance]) {
		if (script == null) continue;
		for (const s of script.content.body) {
			if (s.type !== 'ImportDeclaration' || s.source.value !== 'svelte')
				continue;
			for (const spec of s.specifiers) {
				if (spec.type !== 'ImportSpecifier') continue;
				const imported = spec.imported.name ?? spec.imported.value;
				if (CONTEXT.has(imported)) context.set(spec.local.name, imported);
			}
		}
	}
	/** owner is the type of the node whose field holds node */
	const walk = (node: any, owner: string): void => {
		if (Array.isArray(node)) {
			for (const n of node)
				if (n !== null && typeof n === 'object') walk(n, owner);
			return;
		}
		const what = problem_of(node, owner, context);
		if (what !== null) found.push({ what, at: node.start });
		for (const key in node) {
			if (key === 'metadata' || key === 'loc' || key === 'parent') continue;
			const value = node[key];
			if (value !== null && typeof value === 'object') walk(value, node.type);
		}
	};
	for (const root of [ast.module, ast.instance, ast.fragment])
		if (root != null) walk(root, '');
	found.sort((a, b) => a.at - b.at);
	return found.map(({ what, at }) => ({ what, ...line_column(code, at) }));
}

function problem_of(
	node: any,
	owner: string,
	context: Map<string, string>
): string | null {
	switch (node.type) {
		case 'BindDirective':
			return 'bind:' + node.name;
		case 'UseDirective':
			return 'use:' + node.name;
		case 'OnDirective':
			return 'on:' + node.name;
		case 'AnimateDirective':
			return 'animate:' + node.name;
		case 'TransitionDirective':
			return (
				(node.intro && node.outro
					? 'transition:'
					: node.intro
						? 'in:'
						: 'out:') + node.name
			);
		case 'AttachTag':
			return '{@attach}';
		case 'CallExpression': {
			if (node.callee.type !== 'Identifier') return null;
			const local: string = node.callee.name;
			const imported = context.get(local);
			if (imported === undefined) return null;
			return local === imported ? local + '()' : `${local}() (${imported})`;
		}
		case 'Attribute':
			// an event attribute, on a component it is a prop like any other
			return ELEMENTS.has(owner) && /^on./i.test(node.name) ? node.name : null;
		default:
			return null;
	}
}

function line_column(
	code: string,
	at: number
): { line: number; column: number } {
	let line = 1;
	let start = 0;
	for (
		let i = code.indexOf('\n');
		i !== -1 && i < at;
		i = code.indexOf('\n', i + 1)
	) {
		line++;
		start = i + 1;
	}
	return { line, column: at - start };
}
