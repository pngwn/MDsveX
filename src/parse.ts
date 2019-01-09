import MarkdownIt from 'markdown-it';
import { svelte } from './svelteParse';
import { codeExec } from './codeParse';
import { extname } from 'path';
import fm from 'front-matter';

const defaultOpts = {
  parser: md => md,
  markdownOptions: {},
  extension: '.svexy',
};

// everything is up in everyones business.

export function mdsvex({
  parser = md => md,
  markdownOptions = {},
  extension = '.svexy',
}: {
  parser?: Function;
  markdownOptions: any;
  extension: string;
} = defaultOpts) {
  // scope. i should look at this.
  let scripts = [];

  // this allows the user to modify the instance of markdown-it
  // necessary if they want to add custom plugins, etc.
  const md = parser(new MarkdownIt({ ...markdownOptions, html: true }))
    .use(svelte)
    .use(codeExec, v => {
      scripts.push(v);
    });

  scripts = scripts.filter(v => v === '\n' || v === '');

  return {
    markup: ({ content, filename }) => {
      if (extname(filename) !== extension) return;

      const { attributes, body } = fm(content);
      const html = md.render(body);

      // we don't want a script tag to be appended if there is no script content
      // that could cause problems when svelte compiles the component

      let scriptTag = '';

      if (Object.keys(attributes).length > 0 || scripts.length > 0) {
        scriptTag += `\n<script>\n`;

        if (scripts.length > 0) {
          scriptTag += `${scripts.join('')}`;
          scripts = [];
        }

        // this makes yaml font-matter available in the conponent if any is present
        // should it handle JSON front-matter as well?
        if (Object.keys(attributes).length > 0) {
          scriptTag += `const _fm = ${JSON.stringify(attributes)};`;
        }

        scriptTag += `\n</script>`;
      }

      return {
        code: `${html}${scriptTag}`,
        map: '',
      };
    },
  };
}
