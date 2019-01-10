import MarkdownIt from 'markdown-it';
import { svelte } from './svelteParse';
import { codeExec } from './codeParse';
import { extname } from 'path';
import { escapeCurly } from './escapeCurly';
import fm from 'front-matter';

const defaultOpts = {
  parser: md => md,
  markdownOptions: {},
  extension: '.svexy',
};

export interface svexOptions {
  parser?: Function;
  markdownOptions?: object;
  extension?: string;
}

export function mdsvex({
  parser = md => md,
  markdownOptions = {},
  extension = '.svexy',
}: svexOptions = defaultOpts) {
  // this allows the user to modify the instance of markdown-it
  // necessary if they want to add custom plugins, etc.
  const md = parser(new MarkdownIt({ ...markdownOptions, html: true }))
    .use(svelte)
    .use(escapeCurly)
    .use(codeExec);

  // store the executable script content on the md object
  // a parser would be the best place to do this but we can get
  // the required info more easily this way
  md.svx = [];

  return {
    markup: ({ content, filename }) => {
      if (extname(filename) !== extension) return;

      const { attributes, body } = fm(content);
      const html = md.render(body);

      // we don't want a script tag to be appended if there is no script content
      // that could cause problems when svelte compiles the component
      let scripts = '';

      const isAttributes = Object.keys(attributes).length > 0;
      const isExec = md.svx.length > 0;

      if (isAttributes || isExec) {
        if (isExec) {
          scripts += `${md.svx.join('')}`;
        }

        // this makes yaml font-matter available in the component if any is present
        // I'm not sure if these should be available as individual variable
        // concerned about clashes
        if (isAttributes) {
          scripts += `const _fm = ${JSON.stringify(attributes)};`;
        }

        scripts = `
<script>
${scripts}
</script>`;

        // reset the scripts store or we're in trouble
        md.svx = [];
      }

      return {
        code: `${html}${scripts}`,
        map: '',
      };
    },
  };
}
