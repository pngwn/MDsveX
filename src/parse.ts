import MarkdownIt from 'markdown-it';
import { svelte_block, svelteRenderer } from './svelteParse';

export function parse(markdownString: string): string {
  const md = new MarkdownIt({ html: true });

  md.block.ruler.before('table', 'svelte_block', svelte_block);
  md.renderer.rules['svelte_block'] = svelteRenderer;

  const html = md.render(markdownString);
  return html;
}
