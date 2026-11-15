// the jobs readers come with, in the order a page is written: shape it, fill
// it, connect it, check it. A plugin names its concerns by id in the `mdsvex`
// field of its package.json; the words a reader sees are the site's, here

export type ConcernId = 'layout' | 'text' | 'code' | 'media' | 'navigate' | 'links' | 'cite' | 'data' | 'check';

export const CONCERNS: { id: ConcernId; name: string; line: string }[] = [
	{ id: 'layout', name: 'Lay out a page', line: 'Steps, tabs, disclosures and figures around what you wrote.' },
	{ id: 'text', name: 'Mark up text', line: 'Keys, badges, marks, abbreviations and emoji inside a sentence.' },
	{ id: 'code', name: 'Show code', line: 'Code blocks with a copy button, and code groups.' },
	{ id: 'media', name: 'Pictures, video and diagrams', line: 'Captions, players, and diagrams drawn from text.' },
	{ id: 'navigate', name: 'Help readers find their way', line: 'Links on headings and a table of contents.' },
	{ id: 'links', name: 'Link out and refer', line: 'A policy for links that leave the site, and links from @user or #123.' },
	{ id: 'cite', name: 'Cite and cross-reference', line: 'A bibliography, and numbered figures, tables and equations.' },
	{ id: 'data', name: 'Know each page', line: 'Facts about a document for a layout or a list of posts.' },
	{ id: 'check', name: 'Catch broken things', line: 'Warnings, or a failed build, before a reader finds them.' },
];
