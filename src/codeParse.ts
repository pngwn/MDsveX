export function codeExec(md, cb) {
  // copy the default fence renderer
  const defaultRender = md.renderer.rules['fence'];

  // execute the cb function and return an empty string to ensure nothing is rendered
  md.renderer.rules['fence'] = function(tokens, idx, options, env, self) {
    if (tokens[idx].info === 'js exec') {
      cb(tokens[idx].content);
      return '';
    }

    // if there is no match, revert to the standard fence renderer
    return defaultRender(tokens, idx, options, env, self);
  };
}
