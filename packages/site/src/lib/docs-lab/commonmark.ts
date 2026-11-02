// CommonMark's reading of a source, for the contrasts: micromark, which passes
// the whole CommonMark spec, with GFM's extensions for the one row about GFM's
// autolinks. The site has no dependency on it, so it is found where pnpm keeps
// it for @mdsvex/migrate's remark; adopted for real, it would be a
// devDependency of the site and a plain import. Used at build time and, in the
// workbook, in the browser once a reader edits
// the two calls used, typed here: the site can't see the packages' own types
type Extension = unknown;
interface Micromark {
	micromark(source: string, options?: { extensions?: Extension[]; htmlExtensions?: Extension[] }): string;
}
interface Gfm {
	gfm(): Extension;
	gfmHtml(): Extension;
}

const micromarks = import.meta.glob<Micromark>(
	'../../../../../node_modules/.pnpm/micromark@*/node_modules/micromark/index.js',
);
const gfms = import.meta.glob<Gfm>(
	'../../../../../node_modules/.pnpm/micromark-extension-gfm@*/node_modules/micromark-extension-gfm/index.js',
);

const first = <T>(found: Record<string, () => Promise<T>>, name: string) => {
	const load = Object.values(found)[0];
	if (!load) throw new Error(`docs-lab: ${name} is not in node_modules/.pnpm`);
	return load();
};

let loaded: Promise<(source: string, gfm: boolean) => string> | null = null;

/** load micromark once, and read with it */
export function commonmark() {
	loaded ??= Promise.all([first(micromarks, 'micromark'), first(gfms, 'micromark-extension-gfm')]).then(
		([{ micromark }, { gfm, gfmHtml }]) =>
			(source: string, with_gfm: boolean) =>
				with_gfm ? micromark(source, { extensions: [gfm()], htmlExtensions: [gfmHtml()] }) : micromark(source),
	);
	return loaded;
}
