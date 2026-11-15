; zed capture names, markdown nodes take the markup names zed markdown uses

; blocks

[
  (atx_heading)
  (thematic_break)
] @title.markup

[
  (list_marker_minus)
  (list_marker_plus)
  (list_marker_star)
  (list_marker_dot)
  (list_marker_parenthesis)
  (task_list_marker_unchecked)
  (task_list_marker_checked)
] @punctuation.list_marker.markup

[
  (block_quote_marker)
  (block_continuation)
  (pipe_table_delimiter_row)
  (hard_line_break)
] @punctuation.markup

"|" @punctuation.markup

[
  (fenced_code_block_delimiter)
  (info_string)
  (frontmatter_delimiter)
] @punctuation.embedded.markup

; inlines

(emphasis) @emphasis.markup
(strong_emphasis) @emphasis.strong.markup
(strikethrough) @strikethrough.markup
(emphasis_delimiter) @punctuation.markup

[
  (code_span)
  (inline_math)
] @text.literal.markup

[
  (inline_link)
  (full_reference_link)
  (collapsed_reference_link)
  (image)
  (link_reference_definition)
  (footnote_reference)
  (footnote_label)
] @link_text.markup

[
  (link_destination)
  (uri_autolink)
] @link_uri.markup

(link_title) @string

(backslash_escape) @string.escape
[
  (entity_reference)
  (numeric_character_reference)
] @string.special

; directives

(directive_marker) @punctuation.special
(directive_name) @function
(argument_name) @property
(argument_value) @string

; html, lowercase tags are elements and capitalised ones components

((tag_name) @tag
  (#match? @tag "^[a-z]"))
((tag_name) @type
  (#match? @type "^[A-Z]"))
(attribute_name) @attribute
[
  (attribute_value)
  (quoted_attribute_value)
] @string
(html_comment) @comment
[
  "<"
  ">"
  "</"
  "/>"
] @punctuation.bracket
"=" @operator

; svelte

[
  "{"
  "}"
  "{#"
  "{:"
  "{/"
  "{@"
] @punctuation.special
[
  (block_keyword)
  (tag_keyword)
] @keyword
