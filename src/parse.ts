import MarkdownIt from 'markdown-it';
import { svelte } from './md/svelteParse';
import { sourceExpressions } from './md/imageExpressionParse';
import { codeExec } from './md/codeParse';
import * as p from 'path-browserify';
import { escapeCurly } from './md/escapeCurly';
import fm from 'front-matter';
import fs from 'fs';

const extname = p.default.extname;

const defaultOpts = {
  parser: md => md,
  markdownOptions: {},
  extension: '.svexy',
  outputMeta: false,
};

export interface svexOptions {
  parser?: Function;
  markdownOptions?: object;
  extension?: string;
  layout?: boolean | string;
  outputMeta?: boolean;
}

export function mdsvex({
  parser = md => md,
  markdownOptions = {},
  extension = '.svexy',
  layout,
  outputMeta = false,
}: svexOptions = defaultOpts) {
  // this allows the user to modify the instance of markdown-it
  // necessary if they want to add custom plugins, etc.
  const md = parser(new MarkdownIt({ ...markdownOptions, html: true }))
    .use(svelte)
    .use(escapeCurly)
    .use(codeExec)
    .use(sourceExpressions);
  // store the executable script content on the md object
  // there isn't really a greta place to store this
  md.svx = [];
  md.svxmod = [];
  md.svxstyles = ['', []];

  return {
    markup: ({ content, filename }) => {
      if (extname(filename) !== extension) return;

      const { attributes, body } = fm(content);
      let html = md.render(body);

      // we don't want a script tag to be appended if there is no script content
      // that could cause problems when svelte compiles the component
      let scripts = '';
      let modules = '';
      let styles = '';

      const isAttributes = Object.keys(attributes).length > 0;
      const isExec = md.svx.length > 0;
      const isMod = md.svxmod.length > 0;
      const isStyles = md.svxstyles[0].length > 0 && md.svxstyles[1].length > 0;

      if (isAttributes || isExec || isMod) {
        if (isExec) {
          scripts += `${md.svx.join('')}`;
        }

        if (isMod || isAttributes) {
          modules += `${md.svxmod.join('')}`;

          // this makes yaml front-matter available in the component if any is present
          // I'm not sure if these should be available as individual variables
          // concerned about clashes
          if (isAttributes) {
            const json = JSON.stringify(attributes);

            modules += `export const _metadata = ${json};`;

            if (outputMeta && !fs.existsSync(filename.replace(extension, '.json'))) {
              fs.writeFile(
                filename.replace(extension, '.json'),
                json,
                (err) => {
                  if (err) throw err;
                }
              );
            }
          }

          modules = '\n<script context="module">\n' + modules + '\n</script>';
        }
      }

      // front-matter defined layouts get priority
      const layoutComponent = attributes.layout || layout;

      // import the layout but it could still be undefined
      scripts += layoutComponent
        ? `\nimport Layout from '${layoutComponent}';`
        : '';

      // and wrap the html with it, if it exists
      html = layoutComponent
        ? `\n<Layout ${isAttributes ? '{..._metadata}' : ''}>\n` +
          html.trim() +
          '\n</Layout>\n'
        : html;

      scripts =
        isExec || layoutComponent
          ? '\n<script>\n' + scripts + '\n</script>'
          : '';

      styles = isStyles
        ? '\n<style' +
          (md.svxstyles[0] !== 'css' ? ` lang="${md.svxstyles[0]}"` : '') +
          '>\n' +
          md.svxstyles[1].join('') +
          '\n</style>'
        : '';

      // reset the script and modules or we're in trouble
      md.svx = [];
      md.svxmod = [];

      return {
        code: `${html}${scripts}${modules}${styles}`,
        map: '',
      };
    },
  };
}
