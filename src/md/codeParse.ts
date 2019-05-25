export function codeExec(md) {
  // copy the default fence renderer
  const defaultRender = md.renderer.rules['fence'];

  md.renderer.rules['fence'] = function(tokens, idx, options, env, self) {
    if (tokens[idx].info === 'js exec') {
      // add the script content to the svx property but return nothing
      md.svx = md.svx.concat(tokens[idx].content);
      return '';
    }

    if (tokens[idx].info === 'js module') {
      // add the script content to the svx property but return nothing
      md.svxmod = md.svxmod.concat(tokens[idx].content);
      return '';
    }

    // if there is no match, revert to the standard fence renderer
    return defaultRender(tokens, idx, options, env, self);
  };
}
