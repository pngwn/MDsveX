import type { node_buffer } from '../src/utils';

const SENTINEL = 0xffffffff;

/** Escape a string for display in the AST text format. */
function escape(s: string): string {
	return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

/** Format a metadata value for display. */
function fmt_val(v: unknown): string {
	if (typeof v === 'string') return `"${escape(v)}"`;
	if (Array.isArray(v)) return JSON.stringify(v);
	return String(v);
}

/**
 * Node kinds that carry a meaningful value range to display as a quoted string.
 * Container nodes (paragraph, emphasis, etc.) let children convey content.
 */
const VALUE_KINDS = new Set([
	'text',
	'heading',
	'code_fence',
	'code_span',
	'html_comment',
	'mustache',
	'svelte_tag',
	'svelte_branch',
	'directive_leaf',
	'directive_container',
	'frontmatter',
	'import_statement',
]);

/** Metadata keys that need source-resolution (byte ranges -> string). */
const INFO_KEYS = new Set(['info_start', 'info_end']);

/**
 * Print a human-readable, diffable text representation of the AST.
 *
 * Format:
 *   root
 *     heading depth=2 "Hello"
 *     paragraph
 *       text "world"
 */
export function print_ast(
	nodes: node_buffer,
	source: string,
	index: number = 0,
	depth: number = 0
): string {
	const node = nodes.get_node(index);
	const indent = '  '.repeat(depth);
	const parts: string[] = [node.kind];

	// Collect metadata key=value pairs
	const meta = node.metadata;
	if (meta) {
		// Resolve info_start/info_end into a single info="..." attribute
		if (
			meta.info_start !== undefined &&
			meta.info_end !== undefined &&
			meta.info_start !== meta.info_end
		) {
			const info = source.slice(meta.info_start, meta.info_end);
			if (info) parts.push(`info="${escape(info)}"`);
		}

		for (const [key, val] of Object.entries(meta)) {
			if (INFO_KEYS.has(key)) continue;
			if (val === undefined || val === null) continue;
			if (key === 'attributes' && typeof val === 'object') {
				// HTML attributes, format as key=value pairs inline
				for (const [ak, av] of Object.entries(val)) {
					parts.push(`${ak}=${fmt_val(av)}`);
				}
				continue;
			}
			parts.push(`${key}=${fmt_val(val)}`);
		}
	}

	// Quoted value for leaf / value-bearing nodes
	if (VALUE_KINDS.has(node.kind)) {
		const [vs, ve] = node.value;
		if (vs !== SENTINEL && ve !== SENTINEL && ve > vs) {
			const val = source.slice(vs, ve);
			parts.push(`"${escape(val)}"`);
		}
	}

	const lines: string[] = [indent + parts.join(' ')];

	// Recurse into children
	for (const child of node.children) {
		lines.push(print_ast(nodes, source, child, depth + 1));
	}

	return lines.join('\n');
}
