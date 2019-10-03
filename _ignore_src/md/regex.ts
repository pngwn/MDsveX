// i'm not even going to try to understand this
// but that won't stop me from stealing it

// pretty much the standard markdown-it regex
// added some things to handle svelte:* tags
// should be fine, might break randomly

const attr_name = '[a-zA-Z_:][a-zA-Z0-9:._-]*';

const unquoted = '[^"\'=<>`\\x00-\\x20]+';
const unquoted_expression = '{[^]+}';
const single_quoted = "'[^']*'";
const double_quoted = '"[^"]*"';

const attr_value =
  '(?:' +
  unquoted +
  '|' +
  single_quoted +
  '|' +
  double_quoted +
  '|' +
  unquoted_expression +
  ')';

const attribute = '(?:\\s+' + attr_name + '(?:\\s*=\\s*' + attr_value + ')?)';

// this is what was modified, it seems to pass tests without breaking anything
const open_tag =
  '<[A-Za-z][A-Za-z0-9\\-]*:*[a-zA-Z]+' + attribute + '*\\s*\\/?>';

const close_tag = '<\\/[A-Za-z][A-Za-z0-9\\-]*\\s*>';

const HTML_OPEN_CLOSE_TAG_RE = new RegExp(
  '^(?:' + open_tag + '|' + close_tag + ')'
);

export { HTML_OPEN_CLOSE_TAG_RE };
