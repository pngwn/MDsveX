export function codeExec(md, cb) {
  const defaultRender = md.renderer.rules['fence'];

  md.renderer.rules['fence'] = function(tokens, idx, options, env, self) {
    // if (tokens[idx].type === 'code_block') {
    // console.log(
    //   'TOKENS',
    //   tokens[idx],
    //   'IDX',
    //   idx,
    //   'OPTIONS',
    //   options,
    //   'ENV',
    //   env
    // );
    if (tokens[idx].info === 'js exec') {
      cb(tokens[idx].content);
      return '';
    }

    return defaultRender(tokens, idx, options, env, self);
  };
  // console.log();

  // cb();
}
