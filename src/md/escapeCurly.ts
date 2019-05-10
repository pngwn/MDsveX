// is this really enough? is it too simple to be true?
// if anything break catastrophically, it wasn't my fault

export function replaceCurlies(str) {
  return str.replace(/{/g, '&#123;').replace(/}/g, '&#125;');
}

export function escapeCurly(md) {
  const default_code_inline = md.renderer.rules.code_inline;
  const default_code_block = md.renderer.rules.code_block;
  const default_fence = md.renderer.rules.fence;

  md.renderer.rules.code_block = function(tokens, idx, options, env, slf) {
    return replaceCurlies(default_code_block(tokens, idx, options, env, slf));
  };
  md.renderer.rules.code_inline = function(tokens, idx, options, env, slf) {
    return replaceCurlies(default_code_inline(tokens, idx, options, env, slf));
  };
  md.renderer.rules.fence = function(tokens, idx, options, env, slf) {
    return replaceCurlies(default_fence(tokens, idx, options, env, slf));
  };
}
