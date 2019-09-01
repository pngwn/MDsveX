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
      // add the module script content to the svxmod property but return nothing
      md.svxmod = md.svxmod.concat(tokens[idx].content);
      return '';
    }

    let css_lang;
    if ((css_lang = tokens[idx].info.match(/^([a-z]+) style$/))) {
      // we are foolishly supporting other style languages so some checks are necessary
      if (md.svxstyles[0].length === 0) md.svxstyles[0] = css_lang[1];
      if (md.svxstyles[0].length > 0 && css_lang[1] !== md.svxstyles[0])
        throw new Error('Do not mix styling languages in a single file.');

      // add the style content to the svxstyles property but return nothing
      md.svxstyles[1] = md.svxstyles[1].concat(tokens[idx].content);
      return '';
    }

    // if there is no match, revert to the standard fence renderer
    return defaultRender(tokens, idx, options, env, self);
  };
}
