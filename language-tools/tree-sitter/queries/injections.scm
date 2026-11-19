; fenced code takes the language of its info string, `math` is LaTeX
(fenced_code_block
  (info_string
    (language) @injection.language)
  (code_fence_content) @injection.content
  (#not-eq? @injection.language "math"))

(fenced_code_block
  (info_string
    (language) @_language)
  (code_fence_content) @injection.content
  (#eq? @_language "math")
  (#set! injection.language "latex"))

(inline_math
  (math_content) @injection.content
  (#set! injection.language "latex"))

(frontmatter
  (frontmatter_content) @injection.content
  (#set! injection.language "yaml"))

((import_statement) @injection.content
  (#set! injection.language "javascript"))

; script with lang="ts" is TypeScript, any other script JavaScript
(raw_element
  (start_tag
    (tag_name) @_tag
    (attribute
      (attribute_name) @_attr
      (quoted_attribute_value
        (attribute_value) @_lang)))
  (raw_text) @injection.content
  (#eq? @_tag "script")
  (#eq? @_attr "lang")
  (#any-of? @_lang "ts" "typescript")
  (#set! injection.language "typescript"))

(raw_element
  (start_tag
    (tag_name) @_tag) @_start
  (raw_text) @injection.content
  (#eq? @_tag "script")
  (#not-match? @_start "lang=[\"']?(ts|typescript)")
  (#set! injection.language "javascript"))

(raw_element
  (start_tag
    (tag_name) @_tag)
  (raw_text) @injection.content
  (#eq? @_tag "style")
  (#set! injection.language "css"))

; the inside of {...}, {@...} and the head of a block tag
((expression) @injection.content
  (#set! injection.language "javascript"))
