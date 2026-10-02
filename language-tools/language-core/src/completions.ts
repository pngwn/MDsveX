/**
 * what to complete in frontmatter and directive args, the props come from
 * the type alias pfm_to_svelte emits for each template and directive
 */

import type * as TS from 'typescript';
import { template_value_at, yaml_keys } from '@mdsvex/source-map/pfm-to-svelte';
import type { PropsProbe } from '@mdsvex/source-map/pfm-to-svelte';

interface Range {
	start: number;
	end: number;
}

export type CompletionContext =
	| { kind: 'template'; range: Range }
	| { kind: 'frontmatter_key'; range: Range; existing: string[] }
	| { kind: 'frontmatter_value'; key: string; range: Range }
	| {
			kind: 'arg_key';
			directive: string;
			inline: boolean;
			range: Range;
			existing: string[];
	  }
	| { kind: 'arg_value'; directive: string; key: string; range: Range };

const WORD = /[\w$-]/;

function word_end(source: string, at: number): number {
	while (at < source.length && WORD.test(source[at])) at++;
	return at;
}

function line_of(source: string, offset: number) {
	const start = source.lastIndexOf('\n', offset - 1) + 1;
	let end = source.indexOf('\n', offset);
	if (end < 0) end = source.length;
	return { start, end };
}

/** the end of a value token from start, before a comment, separator or space */
function value_end(source: string, start: number, stop: RegExp): number {
	let at = start;
	const q = source[at];
	if (q === '"' || q === "'") {
		const close = source.indexOf(q, at + 1);
		return close < 0 ? at + 1 : close + 1;
	}
	while (at < source.length && !stop.test(source[at])) at++;
	return at;
}

// a directive name and label, then the open paren of its args
const DIRECTIVE =
	/(?<![\w:])(:{1,3})([A-Za-z_][\w-]*)\[(?:[^[\]\n\\]|\\.|\[[^[\]\n]*\])*\]\(/g;

/** what the offset completes, null for nothing this module offers */
export function completion_context(
	source: string,
	offset: number,
	frontmatter: Range | null
): CompletionContext | null {
	if (
		frontmatter !== null &&
		offset >= frontmatter.start &&
		offset <= frontmatter.end
	) {
		const template = template_value_at(source, offset, frontmatter);
		if (template !== null) return { kind: 'template', range: template };
		const line = line_of(source, offset);
		const before = source.slice(line.start, offset);
		if (/^[A-Za-z_$][\w$-]*$|^$/.test(before)) {
			const end = word_end(source, offset);
			// a key already written on this line takes a value, not a new key
			if (/^[ \t]*:/.test(source.slice(end, line.end))) return null;
			const keys = yaml_keys(
				source.slice(frontmatter.start, frontmatter.end),
				frontmatter.start
			);
			const existing = [...keys.keys()].filter(
				(k) => keys.get(k)!.start !== line.start
			);
			return {
				kind: 'frontmatter_key',
				range: { start: line.start, end },
				existing,
			};
		}
		const pair = /^([A-Za-z_$][\w$-]*)[ \t]*:[ \t]*(\S*)$/.exec(before);
		if (pair === null) return null;
		const start = offset - pair[2].length;
		return {
			kind: 'frontmatter_value',
			key: pair[1],
			range: {
				start,
				end: Math.max(offset, value_end(source, start, /[\s#]/)),
			},
		};
	}

	const line = line_of(source, offset);
	const text = source.slice(line.start, line.end);
	DIRECTIVE.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = DIRECTIVE.exec(text)) !== null) {
		const args_start = line.start + m.index + m[0].length;
		const close = text.indexOf(')', args_start - line.start);
		const args_end = close < 0 ? line.end : line.start + close;
		if (offset < args_start || offset > args_end) continue;
		const args = source.slice(args_start, args_end);
		const before = source.slice(args_start, offset);
		const segment_start = args_start + before.lastIndexOf(',') + 1;
		const segment = source.slice(segment_start, offset);
		const eq = segment.indexOf('=');
		if (eq >= 0) {
			let start = segment_start + eq + 1;
			while (start < offset && /[ \t]/.test(source[start])) start++;
			return {
				kind: 'arg_value',
				directive: m[2],
				key: segment.slice(0, eq).trim(),
				range: {
					start,
					end: Math.max(offset, value_end(source, start, /[\s,)]/)),
				},
			};
		}
		let start = segment_start;
		while (start < offset && /[ \t]/.test(source[start])) start++;
		const existing: string[] = [];
		for (const k of args.matchAll(/([A-Za-z_][\w-]*)[ \t]*=/g))
			if (args_start + k.index! !== start) existing.push(k[1]);
		return {
			kind: 'arg_key',
			directive: m[2],
			inline: m[1].length === 1,
			range: { start, end: word_end(source, offset) },
			existing,
		};
	}
	return null;
}

/** the template a frontmatter names, undefined when it names none */
export function template_named(
	source: string,
	frontmatter: Range | null
): string | false | undefined {
	if (frontmatter === null) return undefined;
	const m =
		/^(["']?)template\1[ \t]*:[ \t]*(["']?)([^"'#\n]*?)\2[ \t]*(?:#.*)?$/m.exec(
			source.slice(frontmatter.start, frontmatter.end)
		);
	if (m === null || m[3] === '') return undefined;
	return m[3] === 'false' ? false : m[3];
}

/** the probe of a template, or of a directive in the scope of a template */
export function probe_for(
	probes: PropsProbe[],
	kind: PropsProbe['kind'],
	name: string,
	template: string | undefined
): PropsProbe | undefined {
	if (kind === 'template')
		return probes.find((p) => p.kind === 'template' && p.name === name);
	return (
		probes.find(
			(p) =>
				p.kind === 'directive' && p.name === name && p.template === template
		) ??
		probes.find(
			(p) =>
				p.kind === 'directive' && p.name === name && p.template === undefined
		)
	);
}

export interface Prop {
	name: string;
	/** the type as typescript prints it */
	type: string;
	optional: boolean;
	documentation: string;
	/** the literal values the type allows, as yaml or an arg writes them */
	values: string[];
}

/** the props a probe names, null when the program does not hold it */
export function props_of(
	ts: typeof TS,
	program: TS.Program,
	file: string,
	alias: string
): Prop[] | null {
	const sf = program.getSourceFile(file);
	if (sf === undefined) return null;
	let found: TS.TypeAliasDeclaration | undefined;
	const visit = (node: TS.Node): void => {
		if (found) return;
		if (ts.isTypeAliasDeclaration(node) && node.name.text === alias)
			found = node;
		else ts.forEachChild(node, visit);
	};
	visit(sf);
	if (found === undefined) return null;
	const checker = program.getTypeChecker();
	const type = checker.getTypeFromTypeNode(found.type);
	if (type.flags & ts.TypeFlags.Any) return null;
	const props: Prop[] = [];
	for (const symbol of checker.getPropertiesOfType(type)) {
		const prop_type = checker.getTypeOfSymbolAtLocation(symbol, found);
		props.push({
			name: symbol.name,
			type: checker.typeToString(
				checker.getNonNullableType(prop_type),
				found,
				ts.TypeFormatFlags.NoTruncation
			),
			optional: (symbol.flags & ts.SymbolFlags.Optional) !== 0,
			documentation: ts.displayPartsToString(
				symbol.getDocumentationComment(checker)
			),
			values: literal_values(ts, prop_type),
		});
	}
	return props;
}

function literal_values(ts: typeof TS, type: TS.Type): string[] {
	const parts = type.isUnion() ? type.types : [type];
	const values: string[] = [];
	for (const t of parts) {
		if (t.isStringLiteral()) values.push(t.value);
		else if (t.isNumberLiteral()) values.push(String(t.value));
		else if (t.flags & ts.TypeFlags.BooleanLiteral)
			values.push((t as { intrinsicName?: string }).intrinsicName ?? '');
	}
	return values.filter((v) => v !== '');
}
