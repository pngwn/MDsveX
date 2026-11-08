// a component from the module svelte compiled, its imports taken from a map
// instead of loaded: svelte's runtime, and the plugin's directive components,
// which Vite compiled as part of the site. The same on the server, to render
// an example when the site builds, and in the browser, to run an edited one.
//
// build/examples.js does this with svelte's runtime alone, which is why its
// `result` fences can't take a plugin; the map is what this adds

export type Modules = Record<string, Record<string, unknown>>;

// `import * as $ from 'x'`, `import { a as b, c } from 'x'`, `import x from 'x'`, `import 'x'`
const IMPORT = /^import\s+(?:\*\s+as\s+([\w$]+)\s+from\s+|\{([^}]*)\}\s+from\s+|([\w$]+)\s+from\s+)?['"]([^'"]+)['"];?[ \t]*$/gm;

/** the specifiers a module imports, so the caller can load the ones it lacks */
export function imports_of(js: string): string[] {
	return [...js.matchAll(IMPORT)].map((m) => m[4]);
}

export function link(js: string, modules: Modules): unknown {
	const names: string[] = [];
	const values: unknown[] = [];
	const take = (name: string, value: unknown) => {
		names.push(name);
		values.push(value);
	};

	let body = js.replace(IMPORT, (_, star, named, fallback, spec) => {
		const mod = modules[spec];
		// a bare import is for its side effects, svelte's version flag, a stylesheet the page already has
		if (!star && !named && !fallback) return '';
		if (!mod) throw new Error(`the example imports ${spec}, which this page can't give it`);
		if (star) take(star, mod);
		else if (fallback) take(fallback, mod.default);
		else
			for (const part of named.split(',')) {
				const [from, as = from] = part.trim().split(/\s+as\s+/);
				if (from) take(as, mod[from]);
			}
		return '';
	});

	let component = '';
	body = body
		.replace(/^export default function ([\w$]+)/m, (_, name) => {
			component = name;
			return `function ${name}`;
		})
		// frontmatter's metadata and plugin_data, from the module script
		.replace(/^export (const|let|function|class) /gm, '$1 ');
	if (!component) throw new Error('svelte gave no component');
	if (/^\s*(import|export)\s/m.test(body)) throw new Error('the compiled module has an import or export the linker does not read');

	return new Function(...names, `${body}\nreturn ${component};`)(...values);
}
