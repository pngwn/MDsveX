; blocks

(atx_heading (heading_content) @markup.heading)
((atx_heading (atx_h1_marker)) @markup.heading.1)
((atx_heading (atx_h2_marker)) @markup.heading.2)
((atx_heading (atx_h3_marker)) @markup.heading.3)
((atx_heading (atx_h4_marker)) @markup.heading.4)
((atx_heading (atx_h5_marker)) @markup.heading.5)
((atx_heading (atx_h6_marker)) @markup.heading.6)

[
  (atx_h1_marker)
  (atx_h2_marker)
  (atx_h3_marker)
  (atx_h4_marker)
  (atx_h5_marker)
  (atx_h6_marker)
  (thematic_break)
  (block_quote_marker)
  (block_continuation)
] @punctuation.special

(block_quote) @markup.quote

[
  (list_marker_minus)
  (list_marker_plus)
  (list_marker_star)
  (list_marker_dot)
  (list_marker_parenthesis)
] @markup.list

(task_list_marker_unchecked) @markup.list.unchecked
(task_list_marker_checked) @markup.list.checked

(fenced_code_block_delimiter) @punctuation.delimiter
(info_string (language) @label)
(code_fence_content) @markup.raw.block

(frontmatter_delimiter) @punctuation.delimiter

(pipe_table_header (pipe_table_cell) @markup.heading)
(pipe_table_delimiter_row) @punctuation.special
"|" @punctuation.special

; inlines

(emphasis) @markup.italic
(strong_emphasis) @markup.strong
(strikethrough) @markup.strikethrough
[(subscript) (superscript)] @markup.italic
(emphasis_delimiter) @punctuation.delimiter

(code_span) @markup.raw
(inline_math) @markup.math
[(code_span_delimiter) (math_delimiter)] @punctuation.delimiter

[(link_text) (image_description) (link_label)] @markup.link.label
[(link_destination) (uri_autolink)] @markup.link.url
(link_title) @string
[(footnote_reference) (footnote_label)] @markup.link.label

(backslash_escape) @string.escape
[(entity_reference) (numeric_character_reference)] @character.special
(hard_line_break) @punctuation.special

["[" "]" "![" "[^" "]:" "(" ")"] @punctuation.bracket

; directives

(directive_marker) @punctuation.special
(directive_name) @function
(directive_label) @markup.link.label
(argument_name) @variable.parameter
(argument_value) @string
"," @punctuation.delimiter

; html

(tag_name) @tag
((tag_name) @type
  (#match? @type "^[A-Z]"))
(attribute_name) @attribute
[(attribute_value) (quoted_attribute_value)] @string
(html_comment) @comment
["<" ">" "</" "/>"] @tag.delimiter
"=" @operator

; svelte

["{" "}" "{#" "{:" "{/" "{@"] @punctuation.special
[(block_keyword) (tag_keyword)] @keyword
