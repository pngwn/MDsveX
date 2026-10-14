/**
 * the modules a ?metadata and a ?data import load, made from the source of the
 * document with nothing read from disk
 */
import { metadata_export, parse_frontmatter } from './frontmatter';
import type { FrontmatterOptions } from './frontmatter';
import { PLUGIN_DATA_EXPORT, plugin_data_export } from './plugin_data';
import type { PluginData } from './plugin_data';

/** the offset after any spaces and tabs from at */
function skip_blanks(source: string, at: number): number {
	let code = source.charCodeAt(at);
	while (code === 32 || code === 9) code = source.charCodeAt(++at);
	return at;
}

/**
 * the start and end of the frontmatter value of a normalized source, null
 * without frontmatter, these are the bounds the parser gives the node
 */
export function frontmatter_bounds(source: string): [number, number] | null {
	if (!source.startsWith('---')) return null;
	const open = skip_blanks(source, 3);
	if (source.charCodeAt(open) !== 10) return null;
	// the newline that ends the opening fence also opens a closing one
	let close = source.indexOf('\n---', open);
	while (close !== -1) {
		const after = source.charCodeAt(skip_blanks(source, close + 4));
		// nan is the end of the source
		if (after === 10 || after !== after) return [open + 1, close + 1];
		close = source.indexOf('\n---', close + 4);
	}
	return null;
}

/** the frontmatter of a document without a parse of its body, undefined when it has none */
export function read_metadata(
	raw: string,
	parse: FrontmatterOptions['parse']
): Record<string, unknown> | undefined {
	// the parser reads \r\n and a lone \r as \n, and so do its offsets
	const source = raw.indexOf('\r') === -1 ? raw : raw.replace(/\r\n?/g, '\n');
	const bounds = frontmatter_bounds(source);
	return bounds === null
		? undefined
		: parse_frontmatter(source, bounds[0], bounds[1], parse);
}

/**
 * the module a ?metadata import loads, its metadata is the export of the
 * compiled document, undefined when the document has no frontmatter
 */
export function metadata_module(
	raw: string,
	parse: FrontmatterOptions['parse']
): string {
	const metadata = read_metadata(raw, parse);
	// a compiled document has no export then, this one stays so a named import links
	const named =
		metadata === undefined
			? 'export const metadata = undefined;'
			: metadata_export(metadata);
	return named + '\nexport default metadata;\n';
}

/**
 * the module a ?data import loads, the metadata and what plugins left as the
 * compiled document exports them, both undefined when it exports neither
 */
export function data_module(
	metadata: Record<string, unknown> | undefined,
	data: PluginData | undefined
): string {
	return (
		(metadata === undefined
			? 'export const metadata = undefined;'
			: metadata_export(metadata)) +
		'\n' +
		(data === undefined
			? `export const ${PLUGIN_DATA_EXPORT} = undefined;`
			: plugin_data_export(data)) +
		`\nexport default { metadata, ${PLUGIN_DATA_EXPORT} };\n`
	);
}
