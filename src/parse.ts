import MarkdownIt from 'markdown-it';
import { svelte_block, svelteRenderer } from './svelteParse';

export function markdownParser(options) {
  const md = new MarkdownIt(options);

  md.block.ruler.before('table', 'svelte_block', svelte_block);
  md.renderer.rules['svelte_block'] = svelteRenderer;
  return md;
}

export function parse(markdownString: string): string {
  const md = markdownParser({ html: true });

  const html = md.render(markdownString);
  return html;
}
