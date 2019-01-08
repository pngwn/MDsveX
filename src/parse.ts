import MarkdownIt from 'markdown-it';
import { svelte } from './svelteParse';

export function markdownParser(options) {
  return new MarkdownIt(options).use(svelte);
}

export function parse(markdownString: string): string {
  const md = markdownParser({ html: true });

  const html = md.render(markdownString);
  return html;
}
