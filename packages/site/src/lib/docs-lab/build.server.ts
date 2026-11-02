// the lab pages at build time: the prose compiled by mdsvex, every example
// compiled by mdsvex with its mappings (so the score can wash its output, as on
// the atlas), every contrast read by micromark and by mdsvex. The pages are
// prerendered, so only the results reach the browser
import { compile } from 'mdsvex/compile';
import { create_highlight, load_default_languages } from 'mdsvex/highlight';
import { pretty, rendered } from '../../../build/examples.js';
import { commonmark } from './commonmark';
import { markdown } from './content/markdown';
import { templates } from './content/templates';
import { cue_ranges, options_for, segments_of } from './setup';
import type {
	BuiltContrast,
	BuiltExample,
	BuiltPage,
	BuiltUnit,
	ContrastSpec,
	ExampleSpec,
	PageSpec,
	Reading,
	Unit,
} from './types';

// highlighting as the site's vite.config.js sets it for the docs
let highlighter: Promise<ReturnType<typeof create_highlight>> | null = null;
const highlight = () =>
	(highlighter ??= load_default_languages().then((languages) =>
		create_highlight({
			languages: { ...languages, svx: 'markdown', mdsvex: 'markdown', sig: 'typescript' },
			annotations: false,
		}),
	));

async function md(text: string): Promise<string> {
	return compile(text, { filename: '/lab.svx', highlight: await highlight() }).code.trim();
}

/** a line of prose: mdsvex's paragraph, without the paragraph */
async function inline(text: string): Promise<string> {
	return (await md(text)).replace(/^<p>/, '').replace(/<\/p>$/, '');
}

async function fence(lang: string, code: string): Promise<string> {
	return md(`\`\`\`${lang}\n${code.replace(/\n$/, '')}\n\`\`\`\n`);
}

async function example(spec: ExampleSpec): Promise<BuiltExample> {
	const setup = spec.setup ?? 'plain';
	const built: BuiltExample = {
		source: spec.source,
		file: spec.file,
		setup,
		scored: !!spec.scored,
		from_prose: !!spec.from_prose,
		source_html: await fence('svx', spec.source),
		code: '',
		segments: [],
	};
	try {
		const result = compile(spec.source, { ...options_for(setup, spec.file), sourcemap: true });
		built.code = result.code;
		built.segments = segments_of(result);
	} catch (error) {
		built.error = (error as Error).message;
	}
	return built;
}

async function reading(html: string): Promise<Reading> {
	const laid = pretty(html.trim());
	return { html: laid, html_code: await fence('html', laid) };
}

async function contrast(spec: ContrastSpec): Promise<BuiltContrast> {
	const read = await commonmark();
	return {
		...spec,
		write: await inline(spec.write),
		commonmark: await inline(spec.commonmark),
		mdsvex: await inline(spec.mdsvex),
		fix: spec.fix && (await inline(spec.fix)),
		ranges: cue_ranges(spec.source, spec.cue),
		source_html: await fence('svx', spec.source),
		commonmark_reading: await reading(read(spec.source, !!spec.gfm)),
		mdsvex_reading: await reading(rendered(spec.source)),
	};
}

async function unit(u: Unit): Promise<BuiltUnit> {
	return {
		...u,
		title: await inline(u.title),
		lede: u.lede && (await md(u.lede)),
		body: u.body && (await md(u.body)),
		edges: u.edges && (await Promise.all(u.edges.map(inline))),
		commonmark: u.commonmark && (await inline(u.commonmark)),
		see: u.see && (await inline(u.see)),
		try: u.try && (await Promise.all(u.try.map(async (t) => ({ ...t, change: await inline(t.change) })))),
		example: u.example && (await example(u.example)),
		error: u.error && (await example(u.error)),
		code: u.code && (await Promise.all(u.code.map(async (c) => ({ file: c.file, html: await fence(c.lang, c.code) })))),
	};
}

async function build(page: PageSpec): Promise<BuiltPage> {
	return {
		...page,
		lede: await Promise.all(page.lede.map(md)),
		sections: await Promise.all(
			page.sections.map(async (s) => ({
				...s,
				lede: s.lede && (await md(s.lede)),
				after: s.after && (await md(s.after)),
				bench: s.bench && (await example(s.bench)),
				units: await Promise.all(s.units.map(unit)),
				contrasts: s.contrasts && (await Promise.all(s.contrasts.map(contrast))),
				added:
					s.added &&
					(await Promise.all(s.added.map(async (a) => ({ ...a, write: await inline(a.write), get: await inline(a.get) })))),
			})),
		),
	};
}

const pages = { markdown, templates };

export function build_page(slug: keyof typeof pages) {
	return build(pages[slug]);
}
