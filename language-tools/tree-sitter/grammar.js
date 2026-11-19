/**
 * @file tree-sitter grammar for mdsvex, PFM.md at the repo root is the spec
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

// one grammar for blocks and inlines, src/scanner.c owns whatever needs columns,
// container prefixes or lookahead past a line

const LIST_KINDS = ['minus', 'plus', 'star', 'dot', 'parenthesis'];

/**
 * the attributes and whitespace of an open tag
 * @param {GrammarSymbols<string>} $
 */
const tag_body = ($) => repeat(choice($._tag_whitespace, $.attribute));

module.exports = grammar({
	name: 'mdsvex',

	// container prefixes are read at the start of every line, wherever the parse is
	extras: ($) => [$.block_continuation, $._indent],

	externals: ($) => [
		$._line_ending,
		$._soft_line_ending,
		$._blank_line,
		$._block_close,
		$.block_continuation,
		$._indent,

		$.block_quote_marker,
		$.list_marker_minus,
		$.list_marker_plus,
		$.list_marker_star,
		$.list_marker_dot,
		$.list_marker_parenthesis,
		$.task_list_marker_unchecked,
		$.task_list_marker_checked,
		$.atx_h1_marker,
		$.atx_h2_marker,
		$.atx_h3_marker,
		$.atx_h4_marker,
		$.atx_h5_marker,
		$.atx_h6_marker,
		$.thematic_break,
		$._fence_open,
		$._fence_close,
		$._code_line,
		$._frontmatter_open,
		$.frontmatter_content,
		$._frontmatter_close,
		$.import_statement,
		$._footnote_definition_start,
		$._link_reference_definition_start,
		$._table_start,
		$._table_row_start,
		$._html_block_start,
		$._svelte_open_line,
		$._svelte_branch_line,
		$._svelte_close_line,
		$._leaf_directive_start,
		$._container_directive_open,
		$._container_directive_close,

		$._text,
		$._emphasis_open,
		$._emphasis_close,
		$._strong_open,
		$._strong_close,
		$._strikethrough_open,
		$._strikethrough_close,
		$._subscript_open,
		$._subscript_close,
		$._superscript_open,
		$._superscript_close,
		$._code_span_open,
		$._code_span_content,
		$._code_span_close,
		$._math_open,
		$._math_close,
		$._bracket_open,
		$._image_open,
		$._bracket_close,
		$._args_open,
		$._inline_directive_marker,
		$.hard_line_break,
		$._tag_name,
		$._raw_tag_name,
		$._raw_text,
		$._expression_content,
		$.uri_autolink,
		$.link_destination,

		// valid only while tree-sitter recovers from an error
		$._error_sentinel,
	],

	rules: {
		document: ($) => seq(optional($.frontmatter), repeat($._top_level)),

		frontmatter: ($) =>
			seq(
				alias($._frontmatter_open, $.frontmatter_delimiter),
				$._line_ending,
				optional($.frontmatter_content),
				alias($._frontmatter_close, $.frontmatter_delimiter),
				$._line_ending
			),

		_top_level: ($) =>
			choice($._block, seq($.import_statement, $._line_ending)),

		_block: ($) =>
			choice(
				$._blank_line,
				$.paragraph,
				$.atx_heading,
				seq($.thematic_break, $._line_ending),
				$.fenced_code_block,
				$.block_quote,
				$.list,
				$.footnote_definition,
				$.link_reference_definition,
				$.pipe_table,
				$.leaf_directive,
				$.container_directive,
				$.svelte_block,
				$.html_block
			),

		paragraph: ($) =>
			seq(
				$._inline,
				repeat(choice($._inline, $._soft_line_ending, $.hard_line_break)),
				$._line_ending
			),

		atx_heading: ($) =>
			seq(
				choice(
					$.atx_h1_marker,
					$.atx_h2_marker,
					$.atx_h3_marker,
					$.atx_h4_marker,
					$.atx_h5_marker,
					$.atx_h6_marker
				),
				optional($.heading_content),
				$._line_ending
			),

		heading_content: ($) => repeat1($._inline),

		fenced_code_block: ($) =>
			seq(
				alias($._fence_open, $.fenced_code_block_delimiter),
				optional($._whitespace),
				optional($.info_string),
				$._line_ending,
				optional($.code_fence_content),
				// a fence left open ends where its container does
				optional(
					seq(
						alias($._fence_close, $.fenced_code_block_delimiter),
						$._line_ending
					)
				)
			),

		info_string: ($) => seq($.language, optional($._info_rest)),
		language: (_) => /[^\s]+/,
		_info_rest: (_) => /[ \t]+[^\r\n]*/,

		code_fence_content: ($) => repeat1($._code_line),

		block_quote: ($) =>
			seq($.block_quote_marker, repeat($._block), $._block_close),

		list: ($) =>
			prec.right(
				choice(
					...LIST_KINDS.map((kind) =>
						repeat1(alias($[`_list_item_${kind}`], $.list_item))
					)
				)
			),

		...Object.fromEntries(
			LIST_KINDS.map((kind) => [
				`_list_item_${kind}`,
				($) => seq($[`list_marker_${kind}`], $._list_item_content),
			])
		),

		_list_item_content: ($) =>
			seq(
				optional(
					choice($.task_list_marker_unchecked, $.task_list_marker_checked)
				),
				repeat($._block),
				$._block_close
			),

		footnote_definition: ($) =>
			seq(
				$._footnote_definition_start,
				'[^',
				$.footnote_label,
				']:',
				repeat($._block),
				$._block_close
			),

		footnote_label: (_) => /[^\s\[\]^]+/,

		link_reference_definition: ($) =>
			seq(
				$._link_reference_definition_start,
				'[',
				$.link_label,
				']:',
				optional($._link_space),
				$.link_destination,
				optional(seq($._link_space, $.link_title)),
				$._line_ending
			),

		pipe_table: ($) =>
			prec.right(
				seq(
					$._table_start,
					alias($._table_row, $.pipe_table_header),
					$._line_ending,
					$.pipe_table_delimiter_row,
					$._line_ending,
					repeat(
						seq(
							$._table_row_start,
							alias($._table_row, $.pipe_table_row),
							$._line_ending
						)
					)
				)
			),

		_table_row: ($) => repeat1(choice('|', $.pipe_table_cell)),
		pipe_table_cell: ($) => prec.right(repeat1($._inline)),
		pipe_table_delimiter_row: (_) =>
			/\|?[ \t]*:?-+:?[ \t]*(\|\|?[ \t]*:?-+:?[ \t]*)*\|?[ \t]*/,

		leaf_directive: ($) =>
			seq(
				$._leaf_directive_start,
				alias('::', $.directive_marker),
				$.directive_name,
				optional($.directive_label),
				optional($.directive_arguments),
				$._line_ending
			),

		container_directive: ($) =>
			prec.right(
				seq(
					$._container_directive_open,
					alias(/:::+/, $.directive_marker),
					$.directive_name,
					optional($.directive_label),
					optional($.directive_arguments),
					$._line_ending,
					repeat($._block),
					optional(
						seq(
							$._container_directive_close,
							alias(/:::+/, $.directive_marker),
							$._line_ending
						)
					)
				)
			),

		svelte_block: ($) =>
			prec.right(
				seq(
					$._svelte_open_line,
					$.svelte_block_start,
					$._line_ending,
					repeat($._block),
					repeat($.svelte_branch),
					optional(
						seq($._svelte_close_line, $.svelte_block_end, $._line_ending)
					)
				)
			),

		svelte_branch: ($) =>
			prec.right(
				seq(
					$._svelte_branch_line,
					$.svelte_block_branch,
					$._line_ending,
					repeat($._block)
				)
			),

		// a line led by a block level tag, a component or a comment, its blocks are siblings
		html_block: ($) =>
			seq($._html_block_start, repeat1($._inline), $._line_ending),

		_inline: ($) =>
			choice(
				$._text,
				$.emphasis,
				$.strong_emphasis,
				$.strikethrough,
				$.subscript,
				$.superscript,
				$.code_span,
				$.inline_math,
				$.inline_link,
				$.full_reference_link,
				$.collapsed_reference_link,
				$.image,
				$.footnote_reference,
				$.inline_directive,
				$.backslash_escape,
				$.entity_reference,
				$.numeric_character_reference,
				$.uri_autolink,
				$.start_tag,
				$.end_tag,
				$.self_closing_tag,
				$.raw_element,
				$.html_comment,
				$.svelte_expression,
				$.svelte_tag,
				$.svelte_block_start,
				$.svelte_block_branch,
				$.svelte_block_end
			),

		_inline_or_break: ($) =>
			choice($._inline, $._soft_line_ending, $.hard_line_break),

		emphasis: ($) =>
			seq(
				alias($._emphasis_open, $.emphasis_delimiter),
				repeat1($._inline_or_break),
				alias($._emphasis_close, $.emphasis_delimiter)
			),

		strong_emphasis: ($) =>
			seq(
				alias($._strong_open, $.emphasis_delimiter),
				repeat1($._inline_or_break),
				alias($._strong_close, $.emphasis_delimiter)
			),

		strikethrough: ($) =>
			seq(
				alias($._strikethrough_open, $.emphasis_delimiter),
				repeat1($._inline_or_break),
				alias($._strikethrough_close, $.emphasis_delimiter)
			),

		subscript: ($) =>
			seq(
				alias($._subscript_open, $.emphasis_delimiter),
				repeat1($._inline_or_break),
				alias($._subscript_close, $.emphasis_delimiter)
			),

		superscript: ($) =>
			seq(
				alias($._superscript_open, $.emphasis_delimiter),
				repeat1($._inline_or_break),
				alias($._superscript_close, $.emphasis_delimiter)
			),

		code_span: ($) =>
			seq(
				alias($._code_span_open, $.code_span_delimiter),
				optional(alias($._code_span_content, $.code_span_content)),
				alias($._code_span_close, $.code_span_delimiter)
			),

		// a `$`, a code span and a `$`, the scanner opens it only when all three are on the line
		inline_math: ($) =>
			seq(
				alias($._math_open, $.math_delimiter),
				alias($._code_span_open, $.code_span_delimiter),
				optional(alias($._code_span_content, $.math_content)),
				alias($._code_span_close, $.code_span_delimiter),
				alias($._math_close, $.math_delimiter)
			),

		_link_text: ($) =>
			seq(
				alias($._bracket_open, '['),
				optional($.link_text),
				alias($._bracket_close, ']')
			),

		link_text: ($) => repeat1($._inline_or_break),

		inline_link: ($) => seq($._link_text, $._link_tail),

		full_reference_link: ($) => seq($._link_text, '[', $.link_label, ']'),

		collapsed_reference_link: ($) => seq($._link_text, '[', ']'),

		image: ($) =>
			seq(
				alias($._image_open, '!['),
				optional($.image_description),
				alias($._bracket_close, ']'),
				choice($._link_tail, seq('[', optional($.link_label), ']'))
			),

		image_description: ($) => repeat1($._inline_or_break),

		link_label: (_) => /([^\[\]\r\n\\]|\\[^\r\n])+/,
		// the scanner checks the whole `(destination "title")` before it opens a link,
		// one line ending may split the parts
		_link_tail: ($) =>
			seq(
				alias(/\([ \t]*(\r?\n[ \t]*)?/, '('),
				optional($.link_destination),
				optional(seq($._link_space, $.link_title)),
				alias(/[ \t]*(\r?\n[ \t]*)?\)/, ')')
			),
		_link_space: (_) => /[ \t]+(\r?\n[ \t]*)?|\r?\n[ \t]*/,
		link_title: (_) =>
			/"([^"\\]|\\[^\r\n])*"|'([^'\\]|\\[^\r\n])*'|\(([^()\\]|\\[^\r\n])*\)/,

		footnote_reference: (_) => /\[\^[^\s\[\]^]+\]/,

		inline_directive: ($) =>
			seq(
				alias($._inline_directive_marker, $.directive_marker),
				$.directive_name,
				$.directive_label,
				optional($.directive_arguments)
			),

		directive_name: (_) => /[a-zA-Z][a-zA-Z0-9_-]*/,

		// links, images and autolinks stay text in a directive's text
		directive_label: ($) =>
			seq(
				alias($._bracket_open, '['),
				repeat(
					choice(
						$._text,
						$.emphasis,
						$.strong_emphasis,
						$.strikethrough,
						$.subscript,
						$.superscript,
						$.code_span,
						$.inline_math,
						$.inline_directive,
						$.backslash_escape,
						$.entity_reference,
						$.numeric_character_reference,
						$.start_tag,
						$.end_tag,
						$.self_closing_tag,
						$.html_comment,
						$.svelte_expression,
						$.svelte_tag,
						$._soft_line_ending,
						$.hard_line_break
					)
				),
				alias($._bracket_close, ']')
			),

		// the scanner reads `(` and the spaces after it only when the whole list is well formed
		directive_arguments: ($) =>
			seq(
				alias($._args_open, '('),
				optional(
					seq(
						$.directive_argument,
						repeat(seq(alias(/[ \t]*,[ \t]*/, ','), $.directive_argument))
					)
				),
				alias(/[ \t]*\)/, ')')
			),

		directive_argument: ($) =>
			seq(
				field('name', $.argument_name),
				alias(/[ \t]*=[ \t]*/, '='),
				field('value', $.argument_value)
			),

		argument_name: (_) => /[a-zA-Z_][a-zA-Z0-9_-]*/,
		argument_value: (_) =>
			/"([^"\\\r\n]|\\[^\r\n])*"|'([^'\\\r\n]|\\[^\r\n])*'|[^\s,()"'\\]+/,

		backslash_escape: (_) => /\\[!-\/:-@\[-`{-~]/,
		entity_reference: (_) => /&[a-zA-Z][a-zA-Z0-9]{1,31};/,
		numeric_character_reference: (_) => /&#([0-9]{1,7}|[xX][0-9a-fA-F]{1,6});/,

		start_tag: ($) =>
			seq('<', alias($._tag_name, $.tag_name), tag_body($), '>'),

		self_closing_tag: ($) =>
			seq(
				'<',
				alias(choice($._tag_name, $._raw_tag_name), $.tag_name),
				tag_body($),
				'/>'
			),

		end_tag: ($) =>
			seq(
				'</',
				alias($._tag_name, $.tag_name),
				optional($._tag_whitespace),
				'>'
			),

		// script, style, textarea and pre content stays raw up to the close tag or the container end
		raw_element: ($) =>
			prec.right(
				seq(
					alias($._raw_start_tag, $.start_tag),
					optional(alias($._raw_text, $.raw_text)),
					optional($.end_tag)
				)
			),

		_raw_start_tag: ($) =>
			seq('<', alias($._raw_tag_name, $.tag_name), tag_body($), '>'),

		attribute: ($) =>
			choice(
				seq(
					$.attribute_name,
					optional(
						seq(
							alias(/[ \t\r\n]*=[ \t\r\n]*/, '='),
							choice(
								$.attribute_value,
								$.quoted_attribute_value,
								$.svelte_expression
							)
						)
					)
				),
				// shorthand `{name}` and spread `{...rest}`
				$.svelte_expression
			),

		attribute_name: (_) => /[^\s"'<>\/=`{}]+/,
		attribute_value: (_) => /[^\s"'=<>`{}]+/,

		quoted_attribute_value: ($) =>
			choice(
				seq(
					'"',
					repeat(
						choice(alias(/[^"{]+/, $.attribute_value), $.svelte_expression)
					),
					'"'
				),
				seq(
					"'",
					repeat(
						choice(alias(/[^'{]+/, $.attribute_value), $.svelte_expression)
					),
					"'"
				)
			),

		html_comment: (_) => /<!--([^-]|-[^-]|--+[^->])*--+>/,

		svelte_expression: ($) => seq('{', optional($.expression), '}'),

		svelte_tag: ($) =>
			seq('{@', alias(/[a-z]+/, $.tag_keyword), optional($.expression), '}'),

		svelte_block_start: ($) =>
			seq('{#', alias(/[a-z]+/, $.block_keyword), optional($.expression), '}'),

		svelte_block_branch: ($) =>
			seq(
				'{:',
				alias(/else[ \t]+if|[a-z]+/, $.block_keyword),
				optional($.expression),
				'}'
			),

		svelte_block_end: ($) => seq('{/', alias(/[a-z]+/, $.block_keyword), '}'),

		expression: ($) => $._expression_content,

		_whitespace: (_) => /[ \t]+/,
		_tag_whitespace: (_) => /[ \t\r\n]+/,
	},
});
