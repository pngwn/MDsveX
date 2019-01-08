import MarkdownIt from 'markdown-it';
import { svelte } from './svelteParse';
import { codeExec } from './codeParse';
import { extname } from 'path';

export function createParser(options, cb) {
  return new MarkdownIt(options).use(svelte).use(codeExec, cb);
}

export function parse(
  markdownString: string
): { body: string; scriptContent: string[] } {
  let scripts = [];

  const md = createParser({ html: true }, v => {
    scripts.push(v);
  });

  scripts = scripts.filter(v => v === '\n');

  return { body: md.render(markdownString), scriptContent: scripts };
}

export const preprocess = {
  markup: ({ content, filename }) => {
    if (extname(filename) !== '.svexy') return;

    const { body, scriptContent } = parse(content);

    return {
      code: `${body}
<script>
${scriptContent.join('\n')}</script>
`,
      map: '',
    };
  },
};
