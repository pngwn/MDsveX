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

export function mdsvex({
  parser = md => md,
  markdownOptions = {},
  extension = '.svexy',
}: {
  parser?: Function;
  markdownOptions: any;
  extension: string;
} = defaultOpts) {
  let scripts = [];

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

      let scriptTag = '';

      if (Object.keys(attributes).length > 0 || scripts.length > 0) {
        scriptTag += `\n<script>\n`;

        if (scripts.length > 0) {
          scriptTag += `${scripts.join('')}`;
          scripts = [];
        }

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
