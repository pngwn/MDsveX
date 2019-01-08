import MarkdownIt from 'markdown-it';
import { svelte } from './svelteParse';
import { codeExec } from './codeParse';
import { extname } from 'path';

const noop = () => {};

export function createParser(options, cb) {
  return new MarkdownIt(options).use(svelte).use(codeExec, cb);
}

export function parse(
  markdownString: string
): { body: string; scriptContent: Set<string> } {
  let scripts = new Set();

  const md = createParser({ html: true }, v => {
    v.split('\n').forEach(s => {
      scripts.add(s);
    });
  });

  return { body: md.render(markdownString), scriptContent: scripts };
}

const preprocess = {
  markup: ({ content, filename }) => {
    if (extname(filename) !== 'svexy') return;

    const { body, scriptContent } = parse(content);
    console.log(scriptContent);
  },
};
