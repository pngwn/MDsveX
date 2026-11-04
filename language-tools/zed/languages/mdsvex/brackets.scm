("(" @open
  ")" @close)

("[" @open
  "]" @close)

("![" @open
  "]" @close)

("[^" @open
  "]" @close)

("{" @open
  "}" @close)

("{#" @open
  "}" @close)

("{:" @open
  "}" @close)

("{/" @open
  "}" @close)

("{@" @open
  "}" @close)

(("\"" @open
  "\"" @close)
  (#set! rainbow.exclude))

(("'" @open
  "'" @close)
  (#set! rainbow.exclude))

(((fenced_code_block_delimiter) @open
  (fenced_code_block_delimiter) @close)
  (#set! rainbow.exclude))

((start_tag
  "<" @open
  ">" @close)
  (#set! rainbow.exclude))

((end_tag
  "</" @open
  ">" @close)
  (#set! rainbow.exclude))
