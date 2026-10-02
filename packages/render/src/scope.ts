/**
 * a scope maps element names to imported components and chains to a parent,
 * closest first, so a template or nested scope can chain in front of the root
 */

/** one replacement, imported as name as local from specifier */
export interface ComponentImport {
	/** the element name, also the export name */
	readonly name: string;
	readonly specifier: string;
	/** generated local binding, internal and never api */
	readonly local: string;
}

/** an element component_mode all keeps because a component can not take its directive */
export interface ReplaceWarning {
	readonly tag: string;
	/** the first directive it carries, such as bind:value */
	readonly directive: string;
	/** offset of the element in the source */
	readonly start: number;
}

export interface ComponentSource {
	/** emitted verbatim as an import specifier */
	specifier: string;
	/** the export names of the module */
	names: string[];
}

const IDENT = /^[A-Za-z_$][\w$]*$/;

export class ComponentScope {
	readonly parent: ComponentScope | null;
	/** names added here and in every parent */
	readonly size: number;
	private readonly own = new Map<string, ComponentImport>();
	private readonly locals = new Set<string>();

	/**
	 * sources are lowest precedence first so a later one replaces a name,
	 * suffix keeps the locals of different scopes apart
	 */
	constructor(
		sources: readonly ComponentSource[],
		suffix: string,
		parent: ComponentScope | null = null
	) {
		this.parent = parent;
		for (let i = 0; i < sources.length; i++) {
			const { specifier, names } = sources[i];
			for (let j = 0; j < names.length; j++) {
				const name = names[j];
				const prior = this.own.get(name);
				// a replaced name keeps its local, which only this scope used
				const local = prior ? prior.local : this.local_for(name, suffix);
				this.own.set(name, { name, specifier, local });
			}
		}
		this.size = this.own.size + (parent === null ? 0 : parent.size);
	}

	/** the replacement for an element name, closest scope first */
	get(name: string): ComponentImport | undefined {
		let scope: ComponentScope | null = this;
		do {
			const found = scope.own.get(name);
			if (found !== undefined) return found;
			scope = scope.parent;
		} while (scope !== null);
		return undefined;
	}

	private local_for(name: string, suffix: string): string {
		const base =
			name.charAt(0).toUpperCase() +
			name.slice(1).replace(/[^\w$]/g, '_') +
			'_MDSVEX_' +
			suffix;
		let local = IDENT.test(base) ? base : '_' + base;
		// only names that are not identifiers can meet, my-el and my_el
		for (let n = 1; this.locals.has(local); n++) local = base + n;
		this.locals.add(local);
		return local;
	}
}

function js_string(s: string): string {
	// specifiers are paths and ids, anything else is escaped as json
	return /^[\w$@#:./~+%-]*$/.test(s) ? "'" + s + "'" : JSON.stringify(s);
}

/**
 * one statement per module and one named import per replacement in first use
 * order, never a namespace import so unused components shake out
 */
export function component_imports(used: readonly ComponentImport[]): string {
	const by_module = new Map<string, string[]>();
	for (let i = 0; i < used.length; i++) {
		const { name, specifier, local } = used[i];
		let list = by_module.get(specifier);
		if (list === undefined) by_module.set(specifier, (list = []));
		// es2022 string export names cover names that are not identifiers
		list.push(
			(IDENT.test(name) ? name : JSON.stringify(name)) + ' as ' + local
		);
	}
	let s = '';
	for (const [specifier, list] of by_module) {
		s +=
			'import { ' + list.join(', ') + ' } from ' + js_string(specifier) + ';\n';
	}
	return s;
}
