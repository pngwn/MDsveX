import { unescapeAll, escapeHtml } from './escapeCurlyUtil';

function code_block(tokens, idx, options, env, slf) {
  var token = tokens[idx];

  return (
    '<pre' +
    slf.renderAttrs(token) +
    '><code>' +
    escapeHtml(tokens[idx].content) +
    '</code></pre>\n'
  );
}

function fence(tokens, idx, options, env, slf) {
  var token = tokens[idx],
    info = token.info ? unescapeAll(token.info).trim() : '',
    langName = '',
    highlighted,
    i,
    tmpAttrs,
    tmpToken;

  if (info) {
    langName = info.split(/\s+/g)[0];
  }

  if (options.highlight) {
    highlighted =
      options.highlight(token.content, langName) || escapeHtml(token.content);
  } else {
    highlighted = escapeHtml(token.content);
  }

  if (highlighted.indexOf('<pre') === 0) {
    return highlighted + '\n';
  }

  // If language exists, inject class gently, without modifying original token.
  // May be, one day we will add .clone() for token and simplify this part, but
  // now we prefer to keep things local.
  if (info) {
    i = token.attrIndex('class');
    tmpAttrs = token.attrs ? token.attrs.slice() : [];

    if (i < 0) {
      tmpAttrs.push(['class', options.langPrefix + langName]);
    } else {
      tmpAttrs[i][1] += ' ' + options.langPrefix + langName;
    }

    // Fake token just to render attributes
    tmpToken = {
      attrs: tmpAttrs,
    };

    return (
      '<pre><code' +
      slf.renderAttrs(tmpToken) +
      '>' +
      highlighted +
      '</code></pre>\n'
    );
  }

  return (
    '<pre><code' +
    slf.renderAttrs(token) +
    '>' +
    highlighted +
    '</code></pre>\n'
  );
}
