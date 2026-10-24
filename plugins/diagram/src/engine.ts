import { createRequire } from 'node:module';

/** which library draws the diagrams, auto takes pele when it is installed and mermaid otherwise */
export type DiagramEngine = 'auto' | 'pele' | 'mermaid';

export type DiagramErrorCode =
	| 'no_engine'
	| 'engine_missing'
	| 'engine_load'
	| 'render';

/**
 * no_engine, neither pele nor mermaid is installed, engine_missing, the
 * engine an option names is not installed, engine_load, pele is installed
 * and could not be loaded, render, a diagram pele could not draw with strict
 */
export class DiagramError extends Error {
	readonly code: DiagramErrorCode;

	constructor(code: DiagramErrorCode, message: string) {
		super('[mdsvex] ' + message);
		this.name = 'DiagramError';
		this.code = code;
	}
}

/** what the plugin uses of pele, its own types stay out of the declarations of this package */
export interface PeleRender {
	render(
		source: string,
		options?: Record<string, unknown>
	): { svg: string; width: number; height: number };
}

// a peer dependency resolves from the package that declares it
const from_here = createRequire(import.meta.url);

/** true when the package resolves, one that exports nothing to require is still installed */
export function installed(
	name: string,
	resolve: (id: string) => string = from_here.resolve
): boolean {
	try {
		resolve(name);
		return true;
	} catch (error) {
		return (
			(error as { code?: string }).code === 'ERR_PACKAGE_PATH_NOT_EXPORTED'
		);
	}
}

/** the engine to use, once, when the plugin is set up, so nothing imports a package that is not there */
export function pick_engine(
	engine: DiagramEngine,
	has: (name: string) => boolean
): 'pele' | 'mermaid' {
	if (engine === 'pele' || engine === 'mermaid') {
		if (has(engine)) return engine;
		throw new DiagramError(
			'engine_missing',
			`diagram({ engine: '${engine}' }) needs the ${engine} package, install it with pnpm add -D ${engine}`
		);
	}
	if (has('pele')) return 'pele';
	if (has('mermaid')) return 'mermaid';
	throw new DiagramError(
		'no_engine',
		'diagram() needs pele or mermaid to draw diagrams, install one with pnpm add -D pele or pnpm add -D mermaid'
	);
}

/** pele is only ever ES modules, require loads it synchronously from Node 20.19 and 22.12 */
export function load_pele(): PeleRender {
	try {
		return from_here('pele') as PeleRender;
	} catch (error) {
		throw new DiagramError(
			'engine_load',
			`pele is installed but could not be loaded, it needs Node 20.19 or 22.12 and later: ${(error as Error).message}`
		);
	}
}
