export function codeExec(md, cb) {
  const defaultRender = md.renderer.rules['fence'];

  md.renderer.rules['fence'] = function(tokens, idx, options, env, self) {
    if (tokens[idx].info === 'js exec') {
      cb(tokens[idx].content);
      return '';
    }

    return defaultRender(tokens, idx, options, env, self);
  };
}
