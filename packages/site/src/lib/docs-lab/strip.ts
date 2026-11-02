// the strip of syntax marks across the top of a page, from the round one
// atlas's specimen line: every mark the page teaches, in its construct's
// colour, each a link to where the page takes it up. In the order the page does
import type { Tone } from '$lib/design/score/kinds';
import type { BuiltPage } from './types';

export interface Mark {
	id: string;
	mark: string;
	tone: Tone;
	/** what it is, in words, for the link's name and the readout */
	name: string;
	/** the heading it sits under */
	section: string;
}

const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&#123;/g, '{').replace(/&#125;/g, '}').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

export function marks_of(page: BuiltPage): Mark[] {
	const out: Mark[] = [];
	for (const s of page.sections) {
		for (const c of s.contrasts ?? []) out.push({ id: c.id, mark: c.mark, tone: c.tone, name: text(c.write), section: s.title });
		for (const u of s.units) out.push({ id: u.id, mark: u.mark, tone: u.tone, name: text(u.title), section: s.title });
		for (const a of s.added ?? []) out.push({ id: a.id, mark: a.mark, tone: a.tone, name: text(a.write), section: s.title });
	}
	return out;
}

/** the marks of one section only, as Learn's "Different" and "Added" want them */
export function marks_in(page: BuiltPage, ids: string[]): Mark[] {
	return marks_of(page).filter((m) => ids.includes(m.section) || ids.includes(m.id));
}
