var _hasOwnProperty = Object.prototype.hasOwnProperty;

function has(object, key) {
  return _hasOwnProperty.call(object, key);
}

function isValidEntityCode(c) {
  /*eslint no-bitwise:0*/
  // broken sequence
  if (c >= 0xd800 && c <= 0xdfff) {
    return false;
  }
  // never used
  if (c >= 0xfdd0 && c <= 0xfdef) {
    return false;
  }
  if ((c & 0xffff) === 0xffff || (c & 0xffff) === 0xfffe) {
    return false;
  }
  // control codes
  if (c >= 0x00 && c <= 0x08) {
    return false;
  }
  if (c === 0x0b) {
    return false;
  }
  if (c >= 0x0e && c <= 0x1f) {
    return false;
  }
  if (c >= 0x7f && c <= 0x9f) {
    return false;
  }
  // out of range
  if (c > 0x10ffff) {
    return false;
  }
  return true;
}

function fromCodePoint(c) {
  /*eslint no-bitwise:0*/
  if (c > 0xffff) {
    c -= 0x10000;
    var surrogate1 = 0xd800 + (c >> 10),
      surrogate2 = 0xdc00 + (c & 0x3ff);

    return String.fromCharCode(surrogate1, surrogate2);
  }
  return String.fromCharCode(c);
}

var UNESCAPE_MD_RE = /\\([!"#$%&'()*+,\-.\/:;<=>?@[\\\]^_`{|}~])/g;
var ENTITY_RE = /&([a-z#][a-z0-9]{1,31});/gi;
var UNESCAPE_ALL_RE = new RegExp(
  UNESCAPE_MD_RE.source + '|' + ENTITY_RE.source,
  'gi'
);

var DIGITAL_ENTITY_TEST_RE = /^#((?:x[a-f0-9]{1,8}|[0-9]{1,8}))/i;

var entities = require('entities/maps/entities.json');

function replaceEntityPattern(match, name) {
  var code = 0;

  if (has(entities, name)) {
    return entities[name];
  }

  if (
    name.charCodeAt(0) === 0x23 /* # */ &&
    DIGITAL_ENTITY_TEST_RE.test(name)
  ) {
    code =
      name[1].toLowerCase() === 'x'
        ? parseInt(name.slice(2), 16)
        : parseInt(name.slice(1), 10);
    if (isValidEntityCode(code)) {
      return fromCodePoint(code);
    }
  }

  return match;
}

function unescapeAll(str) {
  if (str.indexOf('\\') < 0 && str.indexOf('&') < 0) {
    return str;
  }

  return str.replace(UNESCAPE_ALL_RE, function(match, escaped, entity) {
    if (escaped) {
      return escaped;
    }
    return replaceEntityPattern(match, entity);
  });
}

var HTML_ESCAPE_TEST_RE = /[&<>"{}]/;
var HTML_ESCAPE_REPLACE_RE = /[&<>"{}]/g;
var HTML_REPLACEMENTS = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  '{': '&#123;',
  '}': '&#125;',
};

function replaceUnsafeChar(ch) {
  return HTML_REPLACEMENTS[ch];
}

function escapeHtml(str) {
  if (HTML_ESCAPE_TEST_RE.test(str)) {
    return str.replace(HTML_ESCAPE_REPLACE_RE, replaceUnsafeChar);
  }
  return str;
}

export { unescapeAll, escapeHtml };
