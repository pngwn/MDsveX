// what each parser kind is called on the score and which colour it takes.
// design/SCORE.md's table names fourteen constructs; the parser has more kinds,
// so each is placed with the construct it reads as, and the few SCORE.md says
// nothing about (a rule, a definition, a comment) take the ink
import type { KindName } from '../pfm';

/** a colour slug, the <kind> of --line-<kind> and --name-<kind> in tokens.css */
export type Tone =
	| 'list' | 'item' | 'para' | 'quote' | 'heading' | 'fence' | 'emph' | 'strong'
	| 'code' | 'link' | 'expr' | 'comp' | 'logic' | 'directive' | 'text' | 'other';

const TONES: Partial<Record<KindName, Tone>> = {
	list: 'list',
	list_item: 'item',
	paragraph: 'para',
	block_quote: 'quote',
	heading: 'heading',
	code_fence: 'fence', table: 'fence', table_header: 'fence', table_row: 'fence', table_cell: 'fence',
	emphasis: 'emph', strikethrough: 'emph', superscript: 'emph', subscript: 'emph',
	strong_emphasis: 'strong',
	code_span: 'code',
	link: 'link', image: 'link', footnote_reference: 'link',
	mustache: 'expr', svelte_tag: 'expr', import_statement: 'expr',
	html: 'comp',
	svelte_block: 'logic', svelte_branch: 'logic',
	directive_inline: 'directive', directive_leaf: 'directive', directive_container: 'directive', directive_label: 'directive',
	text: 'text', frontmatter: 'text',
};

export function tone(kind: string): Tone {
	return TONES[kind as KindName] ?? 'other';
}

// the kinds whose names say less than the thing does
const WORDS: Partial<Record<KindName, string>> = {
	html: 'element', mustache: 'expression', strong_emphasis: 'strong',
	code_span: 'code', code_fence: 'code block', block_quote: 'quote', list_item: 'item',
	directive_container: 'directive', directive_leaf: 'directive', directive_inline: 'directive',
	directive_label: 'label', svelte_block: 'logic block', svelte_tag: 'tag',
	thematic_break: 'rule', hard_break: 'line break', footnote_reference: 'footnote reference',
	footnote_definition: 'footnote', import_statement: 'import',
};

/** a phrase's name in plain words: `<Counter>`, `note directive`, `emphasis` */
export function spoken(p: { kind: KindName; name?: string }): string {
	if (p.kind === 'html' && p.name) return `<${p.name}>`;
	if (p.kind.startsWith('directive_') && p.kind !== 'directive_label' && p.name) return `${p.name} directive`;
	return WORDS[p.kind] ?? p.kind.replace(/_/g, ' ');
}
