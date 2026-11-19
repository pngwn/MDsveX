export { CursorHTMLRenderer } from './html_cursor.js';
export type {
	CursorBlockEntry,
	TemplateWrapper,
	CodeHighlighter,
	HighlightedBlock,
	HighlightedCode,
	HighlightWarningCode,
	PreMeta,
	SmartPunctuation,
	SmartPunctuationOptions,
	SmartQuotes,
} from './html_cursor.js';
export {
	_emit,
	_node,
	_children,
	_resolve_mappings,
	_out_offsets,
	MapSink,
	escape,
	NONE,
	K_ROOT,
	K_TEXT,
	K_HTML,
	K_LINE_BREAK,
	K_FRONTMATTER,
	K_IMPORT_STATEMENT,
} from './html_cursor.js';
export { ComponentRenderer } from './component.js';
export type { ComponentBlock } from './component.js';
export { CI_TEXT, CI_CODE, CI_SVELTE, CI_STRUCTURE } from './mappings.js';
export type {
	Mapping,
	CodeInformation,
	MappingRole,
	MappingData,
} from './mappings.js';
export {
	build_line_starts,
	offset_to_position,
	mappings_to_v3,
	records_to_v3,
	trace_to_v3,
	trace_to_decoded,
	mapped_source_lines,
} from './sourcemap.js';
export type {
	SourceMapV3,
	MapTrace,
	DecodedSegment,
	DecodedSourceMapV3,
} from './sourcemap.js';
