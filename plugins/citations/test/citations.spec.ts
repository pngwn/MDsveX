import {
	bibliography_of,
	citations,
	CitationsError,
	entry_parts,
} from '@mdsvex/plugin-citations';
import type {
	CitationsData,
	CitationsOptions,
	Cited,
	CslItem,
} from '@mdsvex/plugin-citations';
import {
	compile,
	compile_async,
	compile_inputs,
	CompilerSession,
	PluginAsyncError,
	PluginTaskError,
} from 'mdsvex';
import { describe, expect, test } from 'vitest';

import { PATHS } from '../../../packages/parse/test/plugin_harness';

const ITEMS: CslItem[] = [
	{
		id: 'lovelace1843',
		type: 'article-journal',
		title: 'Notes on the Analytical Engine',
		author: [{ family: 'Lovelace', given: 'Ada' }],
		issued: { 'date-parts': [[1843]] },
		'container-title': 'Scientific Memoirs',
		volume: 3,
		page: '666-731',
	},
	{
		id: 'turing1936',
		type: 'article-journal',
		title: 'On Computable Numbers',
		author: [{ family: 'Turing', given: 'Alan' }],
		issued: { 'date-parts': [[1936, 11]] },
		DOI: '10.1112/plms/s2-42.1.230',
	},
	{
		id: 'babbage1864',
		type: 'book',
		title: 'Passages from the Life of a Philosopher',
		author: [{ family: 'Babbage', given: 'Charles' }],
		issued: { 'date-parts': [[1864]] },
		publisher: 'Longman',
	},
];

const FILES: Record<string, string> = {
	'/site/refs.json': JSON.stringify(ITEMS),
	'/site/other.json': JSON.stringify([{ id: 'other', title: 'Other' }]),
};

async function read(path: string): Promise<string> {
	const text = FILES[path];
	if (text === undefined) throw new Error(`ENOENT ${path}`);
	return text;
}

const NONE = 0xffffffff;

const HEAD = '---\nbibliography: ./refs.json\n---\n\n';

type Options = NonNullable<Parameters<typeof compile_async>[1]>;

function run(source: string, options?: CitationsOptions, more?: Options) {
	return compile_async(source, {
		filename: '/site/doc.svx',
		plugins: [citations(options)],
		read,
		...more,
	});
}

/** the json args of each citation in the code, in order */
function cites_in(code: string): Cited[][] {
	return [...code.matchAll(/cites=\{("(?:[^"\\]|\\.)*")\}/g)].map((match) =>
		JSON.parse(JSON.parse(match[1]))
	);
}

/** the labels of each citation, `1,2` for one with two keys */
async function labels(
	source: string,
	options?: CitationsOptions
): Promise<string[]> {
	const { code } = await run(source, options);
	return cites_in(code).map((cites) => cites.map((c) => c.label).join(','));
}

async function rejected(make: () => Promise<unknown>): Promise<any> {
	try {
		await make();
	} catch (error) {
		return error;
	}
	return undefined;
}

describe('data', () => {
	test('each key of each citation in order, and the entry of each key the file has', async () => {
		const { data } = await run(
			HEAD + 'One :cite[turing1936, lovelace1843] two :cite[turing1936].\n'
		);
		expect(data).toEqual({
			citations: {
				cited: ['turing1936', 'lovelace1843', 'turing1936'],
				'entry:turing1936': {
					key: 'turing1936',
					short: 'Turing',
					authors: 'Alan Turing',
					year: '1936',
					title: 'On Computable Numbers',
					url: 'https://doi.org/10.1112/plms/s2-42.1.230',
				},
				'entry:lovelace1843': {
					key: 'lovelace1843',
					short: 'Lovelace',
					authors: 'Ada Lovelace',
					year: '1843',
					title: 'Notes on the Analytical Engine',
					source: 'Scientific Memoirs 3, 666-731',
				},
			},
		});
	});

	test('the document exports it, and the file is a dependency', async () => {
		const { code, dependencies } = await run(HEAD + ':cite[babbage1864]\n');
		expect(code).toContain(
			'export const plugin_data = {"citations":{"cited":["babbage1864"]'
		);
		expect(dependencies).toEqual(['/site/refs.json']);
	});

	test('a document that cites nothing has no citations key and reads no file', async () => {
		let reads = 0;
		const { data, dependencies } = await run(HEAD + 'text\n', undefined, {
			read: async (path) => {
				reads++;
				return read(path);
			},
		});
		expect(data).toBeUndefined();
		expect(dependencies).toBeUndefined();
		expect(reads).toBe(0);
	});

	test('compile throws a PluginAsyncError, since the file is read later', () => {
		let error: unknown;
		try {
			compile(HEAD + ':cite[turing1936]\n', {
				filename: '/site/doc.svx',
				plugins: [citations()],
			});
		} catch (e) {
			error = e;
		}
		expect(error).toBeInstanceOf(PluginAsyncError);
	});
});

describe('citations', () => {
	test('numeric numbers keys by their first citation', async () => {
		expect(
			await labels(
				HEAD +
					':cite[turing1936] :cite[lovelace1843, turing1936] :cite[babbage1864] :cite[lovelace1843]\n'
			)
		).toEqual(['1', '2,1', '3', '2']);
	});

	test('author-date gives the names and the year', async () => {
		expect(
			await labels(HEAD + ':cite[turing1936, lovelace1843]\n', {
				style: 'author-date',
			})
		).toEqual(['Turing 1936,Lovelace 1843']);
	});

	test('each key links to its entry and has an id the list links back to', async () => {
		const { code } = await run(
			HEAD + ':cite[turing1936, lovelace1843] and :cite[turing1936]\n'
		);
		expect(cites_in(code)).toEqual([
			[
				{
					key: 'turing1936',
					label: '1',
					id: 'cite-1',
					href: '#bib-turing1936',
				},
				{
					key: 'lovelace1843',
					label: '2',
					id: 'cite-2',
					href: '#bib-lovelace1843',
				},
			],
			[
				{
					key: 'turing1936',
					label: '1',
					id: 'cite-3',
					href: '#bib-turing1936',
				},
			],
		]);
		expect(code).toContain(
			"import { cite as Cite_MDSVEX_D_G } from '@mdsvex/plugin-citations/directives';"
		);
	});

	test('an unknown key is reported where it is cited and shows as written, it takes no number', async () => {
		const { code, warnings } = await run(
			HEAD + 'See :cite[nope, turing1936] and :cite[lovelace1843].\n'
		);
		expect(cites_in(code)).toEqual([
			[
				{ key: 'nope', label: 'nope', id: 'cite-1' },
				{
					key: 'turing1936',
					label: '1',
					id: 'cite-2',
					href: '#bib-turing1936',
				},
			],
			[
				{
					key: 'lovelace1843',
					label: '2',
					id: 'cite-3',
					href: '#bib-lovelace1843',
				},
			],
		]);
		expect(warnings).toEqual([
			{
				plugin: 'citations',
				code: 'unknown_key',
				message:
					'/site/refs.json has no entry "nope", the citation shows the key',
				start: { line: 5, column: 4 },
			},
		]);
	});

	test('keys are trimmed and an empty one is dropped', async () => {
		expect(
			await labels(HEAD + ':cite[ turing1936 ,, lovelace1843 ]\n')
		).toEqual(['1,2']);
	});

	test('a citation with no key is reported and cites nothing', async () => {
		const { data, warnings } = await run(HEAD + 'a :cite[] b :cite[ , ]\n');
		expect(data).toBeUndefined();
		expect(warnings?.map((w) => w.code)).toEqual(['no_key', 'no_key']);
	});

	test('cite as a leaf or a container is reported', async () => {
		const { warnings } = await run(
			HEAD + '::cite[turing1936]\n\n:::cite\n:::\n',
			undefined,
			{ strict_directives: false }
		);
		expect(warnings?.map((w) => w.code)).toEqual(['not_inline', 'not_inline']);
	});

	test('inside a list, a quote, a table and a heading', async () => {
		expect(
			await labels(
				HEAD +
					'# A :cite[babbage1864]\n\n- b :cite[turing1936]\n\n> c :cite[babbage1864]\n\n| d |\n|---|\n| :cite[lovelace1843] |\n'
			)
		).toEqual(['1', '2', '1', '3']);
	});
});

describe('the bibliography file', () => {
	test('the frontmatter names it relative to the document', async () => {
		const { dependencies } = await run(
			'---\nbibliography: .././refs.json\n---\n\n:cite[turing1936]\n',
			undefined,
			{ filename: '/site/posts/doc.svx' }
		);
		expect(dependencies).toEqual(['/site/refs.json']);
	});

	test('the option is the file of a document whose frontmatter names none', async () => {
		const { data } = await run(':cite[other]\n', {
			bibliography: '/site/other.json',
		});
		expect(data?.citations?.['entry:other']).toEqual({
			key: 'other',
			short: 'Other',
			title: 'Other',
		});
		const written = await run(HEAD + ':cite[turing1936]\n', {
			bibliography: '/site/other.json',
		});
		expect(written.dependencies).toEqual(['/site/refs.json']);
	});

	test('a relative option is relative to the working directory', async () => {
		const seen: string[] = [];
		await run(
			':cite[a]\n',
			{ bibliography: 'refs/../refs.json' },
			{
				read: async (path) => {
					seen.push(path);
					return '[{"id":"a"}]';
				},
			}
		);
		expect(seen).toEqual([process.cwd().replace(/\\/g, '/') + '/refs.json']);
	});

	test('a windows path gets forward slashes, as vite names files', async () => {
		const seen: string[] = [];
		await run(HEAD + ':cite[a]\n', undefined, {
			filename: 'C:\\site\\docs\\doc.svx',
			read: async (path) => {
				seen.push(path);
				return '[{"id":"a"}]';
			},
		});
		expect(seen).toEqual(['C:/site/docs/refs.json']);
	});

	test('it is read once for every document of a compiler, and again once it changed', async () => {
		let reads = 0;
		const session = new CompilerSession();
		const plugins = [citations()];
		const once = async () => {
			const inputs = compile_inputs({
				plugins,
				filename: '/site/doc.svx',
				read: async (path) => {
					reads++;
					return read(path);
				},
			});
			const parsed = session.parse(
				HEAD + ':cite[turing1936] :cite[babbage1864]\n',
				inputs
			);
			await session.settle(parsed);
			return session.render(parsed, inputs).data?.citations;
		};
		await once();
		await once();
		expect(reads).toBe(1);
		const before = FILES['/site/refs.json'];
		FILES['/site/refs.json'] = JSON.stringify([
			{ id: 'turing1936', title: 'Changed' },
		]);
		try {
			session.invalidate(['/site/refs.json']);
			expect((await once())?.['entry:turing1936']?.title).toBe('Changed');
			expect(reads).toBe(2);
		} finally {
			FILES['/site/refs.json'] = before;
		}
	});

	test('compile_async shares it across calls given the same plugins', async () => {
		let reads = 0;
		const plugins = [citations()];
		const counting = async (path: string) => {
			reads++;
			return read(path);
		};
		for (let i = 0; i < 3; i++)
			await compile_async(HEAD + ':cite[turing1936]\n', {
				filename: `/site/doc${i}.svx`,
				plugins,
				read: counting,
			});
		expect(reads).toBe(1);
	});

	describe('a typed error', () => {
		async function failure(
			source: string,
			options?: CitationsOptions,
			more?: Options
		) {
			const error = await rejected(() => run(source, options, more));
			// a deferred task rejects with its plugin and place, its error is the cause
			const cause = error instanceof PluginTaskError ? error.cause : error;
			expect(cause).toBeInstanceOf(CitationsError);
			return cause as CitationsError;
		}

		test('a document that cites and names no file', async () => {
			const error = await failure(':cite[turing1936]\n');
			expect(error.code).toBe('no_bibliography');
			expect(error.message).toBe(
				'[@mdsvex/plugin-citations] /site/doc.svx cites and names no bibliography, add bibliography: ./refs.json to its frontmatter or give the plugin a bibliography'
			);
		});

		test('a compile that can not read', async () => {
			const error = await failure(HEAD + ':cite[turing1936]\n', undefined, {
				read: undefined,
			});
			expect(error.code).toBe('no_bibliography');
			expect(error.message).toContain('it was given no read option');
		});

		test('a file that is not there', async () => {
			const error = await failure(
				'---\nbibliography: ./gone.json\n---\n\n:cite[a]\n'
			);
			expect(error.code).toBe('bibliography');
			expect(error.message).toBe(
				'[@mdsvex/plugin-citations] /site/gone.json could not be read: ENOENT /site/gone.json'
			);
		});

		test('a file that is no CSL JSON', async () => {
			for (const [text, said] of [
				['{', 'is not CSL JSON, it does not parse as json'],
				['{"id":"a"}', 'is not CSL JSON, which is an array of entries'],
				['[{"title":"a"}]', 'entry 0 of'],
				['[{"id":"a"},{"id":"a"}]', 'has two entries with the id "a"'],
			]) {
				const error = await failure(
					':cite[a]\n',
					{ bibliography: '/x.json' },
					{
						read: async () => text,
					}
				);
				expect(error.code, text).toBe('bibliography');
				expect(error.message, text).toContain(said);
			}
		});

		test('a BibTeX file says how to export CSL JSON', async () => {
			const error = await failure(
				':cite[a]\n',
				{ bibliography: '/refs.bib' },
				{
					read: async () => '@book{a, title={A}}',
				}
			);
			expect(error.message).toBe(
				'[@mdsvex/plugin-citations] /refs.bib is BibTeX, export it as CSL JSON, which Zotero, JabRef and pandoc (pandoc refs.bib -t csljson -o refs.json) write'
			);
		});

		test('a frontmatter key that names no file', async () => {
			const error = await failure('---\nbibliography: 3\n---\n\n:cite[a]\n');
			expect(error.code).toBe('bibliography');
		});

		test('a relative frontmatter path with no filename', async () => {
			const error = await failure(HEAD + ':cite[a]\n', undefined, {
				filename: undefined,
			});
			expect(error.code).toBe('bibliography');
		});
	});
});

describe('the ::bibliography directive', () => {
	/** the data arg of the directive, what its component lists */
	function list_data(code: string): CitationsData {
		const match = /data=\{("(?:[^"\\]|\\.)*")\}/.exec(code);
		return JSON.parse(JSON.parse(match![1]));
	}

	test('it gets the data of the document, citations after it included', async () => {
		const { code, data } = await run(
			HEAD + '::bibliography[References]\n\n:cite[turing1936]\n'
		);
		expect(list_data(code)).toEqual(data!.citations);
		expect(code).toContain(
			'style="numeric">{#snippet label()}References{/snippet}'
		);
	});

	test('with nothing cited it gets no data', async () => {
		const { code } = await run(HEAD + '::bibliography\n');
		expect(code).toContain(
			'<Bibliography_MDSVEX_D_G data={"{}"} style="numeric" />'
		);
	});

	test('a second one is reported and lists nothing', async () => {
		const { code, warnings } = await run(
			HEAD + ':cite[turing1936]\n\n::bibliography\n\n::bibliography\n'
		);
		expect(code.match(/data=\{"\{\}"\}/g)).toHaveLength(1);
		expect(warnings?.map((w) => [w.code, w.start])).toEqual([
			['more_than_one', { line: 9, column: 0 }],
		]);
	});

	test('inline or as a container it is reported', async () => {
		const { warnings } = await run(
			HEAD + 'a :bibliography[x]\n\n:::bibliography\n:::\n',
			undefined,
			{ strict_directives: false }
		);
		expect(warnings?.map((w) => w.code)).toEqual(['not_a_leaf', 'not_a_leaf']);
	});
});

describe('bibliography_of', () => {
	const data: CitationsData = {
		cited: ['turing1936', 'nope', 'lovelace1843', 'turing1936', 'babbage1864'],
		'entry:turing1936': { key: 'turing1936', short: 'Turing', year: '1936' },
		'entry:lovelace1843': {
			key: 'lovelace1843',
			short: 'Lovelace',
			year: '1843',
		},
		'entry:babbage1864': { key: 'babbage1864', short: 'Babbage', year: '1864' },
	};

	test('numeric lists by first citation, with the citations of each', () => {
		expect(
			bibliography_of(data, 'numeric').map(({ id, label, cited_by }) => [
				id,
				label,
				cited_by,
			])
		).toEqual([
			['bib-turing1936', '1', ['cite-1', 'cite-4']],
			['bib-lovelace1843', '2', ['cite-3']],
			['bib-babbage1864', '3', ['cite-5']],
		]);
	});

	test('author-date lists by name, then year, then title', () => {
		expect(
			bibliography_of(
				{
					...data,
					cited: [...data.cited!, 'turing1950', 'turing1950b'],
					'entry:turing1950': {
						key: 'turing1950',
						short: 'Turing',
						year: '1950',
						title: 'B',
					},
					'entry:turing1950b': {
						key: 'turing1950b',
						short: 'Turing',
						year: '1950',
						title: 'A',
					},
				},
				'author-date'
			).map((entry) => entry.label + ' ' + (entry.title ?? ''))
		).toEqual([
			'Babbage 1864 ',
			'Lovelace 1843 ',
			'Turing 1936 ',
			'Turing 1950 A',
			'Turing 1950 B',
		]);
	});

	test('nothing lists nothing', () => {
		expect(bibliography_of(undefined)).toEqual([]);
		expect(bibliography_of({})).toEqual([]);
	});
});

describe('entries', () => {
	async function entry(item: Record<string, unknown>) {
		const { data } = await run(
			':cite[x]\n',
			{ bibliography: '/x.json' },
			{
				read: async () => JSON.stringify([{ id: 'x', ...item }]),
			}
		);
		return data!.citations!['entry:x']!;
	}

	test('names, with particles, suffixes and literal names', async () => {
		expect(
			await entry({
				author: [
					{ family: 'Gogh', given: 'Vincent', 'non-dropping-particle': 'van' },
					{ family: 'King', given: 'Martin Luther', suffix: 'Jr.' },
					{ literal: 'The Royal Society' },
				],
			})
		).toMatchObject({
			authors:
				'Vincent van Gogh, Martin Luther King, Jr. and The Royal Society',
			short: 'van Gogh et al.',
		});
		expect(
			await entry({ author: [{ family: 'A' }, { family: 'B' }] })
		).toMatchObject({ authors: 'A and B', short: 'A and B' });
	});

	test('editors when there are no authors, the title when there are neither', async () => {
		expect(
			await entry({ editor: [{ family: 'E', given: 'D' }] })
		).toMatchObject({
			authors: 'D E',
			short: 'E',
		});
		expect(await entry({ title: 'Anonymous' })).toMatchObject({
			short: 'Anonymous',
		});
		expect(await entry({})).toEqual({ key: 'x', short: 'x' });
	});

	test('the year from date parts or a written date', async () => {
		expect(
			(await entry({ issued: { 'date-parts': [['2001', 2]] } })).year
		).toBe('2001');
		expect((await entry({ issued: { literal: 'Spring 1999' } })).year).toBe(
			'1999'
		);
		expect((await entry({ issued: { raw: 'forthcoming' } })).year).toBe(
			'forthcoming'
		);
	});

	test('a doi is a url and wins over the url', async () => {
		expect(await entry({ DOI: '10.1/x', URL: 'https://e.x' })).toMatchObject({
			url: 'https://doi.org/10.1/x',
		});
		expect(await entry({ DOI: 'https://doi.org/10.1/y' })).toMatchObject({
			url: 'https://doi.org/10.1/y',
		});
		expect(await entry({ URL: 'https://e.x' })).toMatchObject({
			url: 'https://e.x',
		});
	});

	test('the source is the container, volume, issue and pages', async () => {
		expect(
			await entry({
				'container-title': 'J',
				volume: 1,
				issue: '2',
				page: '3-4',
			})
		).toMatchObject({ source: 'J 1(2), 3-4' });
		expect(await entry({ page: 7 })).toMatchObject({ source: '7' });
	});

	test('the parts of a list item in each style', () => {
		const lovelace = {
			key: 'l',
			short: 'Lovelace',
			authors: 'Ada Lovelace',
			year: '1843',
			title: 'Notes?',
			source: 'Scientific Memoirs 3',
			url: 'https://e.x',
		};
		const text = (parts: ReturnType<typeof entry_parts>) =>
			parts.map((part) => `${part.kind}:${part.text}`);
		expect(text(entry_parts(lovelace, 'numeric'))).toEqual([
			'text:Ada Lovelace.',
			'title:Notes?',
			'text:Scientific Memoirs 3.',
			'text:1843.',
			'url:https://e.x',
		]);
		expect(text(entry_parts(lovelace, 'author-date'))).toEqual([
			'text:Ada Lovelace (1843).',
			'title:Notes?',
			'text:Scientific Memoirs 3.',
			'url:https://e.x',
		]);
		expect(
			text(entry_parts({ key: 'a', short: 'A', title: 'A' }, 'author-date'))
		).toEqual(['title:A.', 'text:(n.d.).']);
	});
});

describe('options', () => {
	test('an option of the wrong shape throws when the plugin is made', () => {
		for (const [options, message] of [
			[{ style: 'apa' }, `style must be 'numeric' or 'author-date', got "apa"`],
			[
				{ bibliography: '' },
				'bibliography must be the path of a CSL JSON file, got ""',
			],
			[
				{ bibliography: 3 },
				'bibliography must be the path of a CSL JSON file, got 3',
			],
		] as const) {
			let error: any;
			try {
				citations(options as any);
			} catch (e) {
				error = e;
			}
			expect(error, message).toBeInstanceOf(CitationsError);
			expect(error.code).toBe('option');
			expect(error.message).toBe('[@mdsvex/plugin-citations] ' + message);
		}
	});
});

describe('every parser path', () => {
	/** the data, the warnings and the args of each citation and list, the same whole, fed and over the wire */
	async function parsed(source: string, options?: CitationsOptions) {
		let first: unknown;
		for (const [name, path] of PATHS) {
			const bundle = citations(options);
			const { dispatcher, nodes } = path(source, {
				// mdsvex names the parse plugin of a bundle after the bundle
				plugins: [{ name: bundle.name, ...bundle.parse! }],
				directive_handlers: [
					{ name: bundle.name, directives: bundle.directives! },
				],
				document: {
					filename: '/site/doc.svx',
					frontmatter: () => ({ bibliography: './refs.json' }),
					read,
				},
			});
			await dispatcher!.finish(nodes);
			const args: unknown[] = [];
			// the tree from the root, a revoked node keeps its metadata but has no place
			const walk = (at: number) => {
				for (
					let c = nodes.first_child_at(at);
					c !== NONE;
					c = nodes.next_at(c)
				) {
					const meta = nodes.metadata_at(c) as
						| { name?: string; args?: unknown }
						| undefined;
					if (meta?.name === 'cite' || meta?.name === 'bibliography')
						args.push([meta.name, meta.args]);
					walk(c);
				}
			};
			walk(0);
			const found = {
				data: dispatcher!.data(),
				codes: (dispatcher!.warnings ?? []).map((w) => w.code),
				args,
			};
			if (first === undefined) first = found;
			else expect(found, name).toEqual(first);
		}
		return first as { data: any; codes: string[]; args: [string, any][] };
	}

	const labels_of = (args: [string, any][]) =>
		args
			.filter(([name]) => name === 'cite')
			.map(([, a]) =>
				(JSON.parse(a.cites) as Cited[])
					.map((c) => `${c.id}:${c.label}`)
					.join(',')
			);

	test('whole, fed and over the wire give the same data, numbers and list', async () => {
		const found = await parsed(
			'---\nbibliography: ./refs.json\n---\n\n# A :cite[lovelace1843]\n\nSee :cite[turing1936, nope] and *more :cite[lovelace1843]*.\n\n::bibliography\n\n- one :cite[babbage1864]\n- two\n'
		);
		expect(found.data.citations.cited).toEqual([
			'lovelace1843',
			'turing1936',
			'nope',
			'lovelace1843',
			'babbage1864',
		]);
		expect(labels_of(found.args)).toEqual([
			'cite-1:1',
			'cite-2:2,cite-3:nope',
			'cite-4:1',
			'cite-5:3',
		]);
		expect(found.codes).toEqual(['unknown_key']);
		const list = found.args.find(([name]) => name === 'bibliography')![1];
		expect(JSON.parse(list.data)).toEqual(found.data.citations);
	});

	test('a citation that never closes cites nothing', async () => {
		const found = await parsed(
			':cite[lovelace1843] then :cite[turing1936\n\nand :cite[babbage1864]\n'
		);
		expect(found.data.citations.cited).toEqual(['lovelace1843', 'babbage1864']);
		expect(labels_of(found.args)).toEqual(['cite-1:1', 'cite-2:2']);
	});

	test('a citation inside a construct that is revoked keeps its place', async () => {
		for (const source of [
			'*open :cite[turing1936] and :cite[lovelace1843]\n',
			'[open :cite[turing1936] and :cite[lovelace1843]\n',
			':note[open :cite[turing1936] and :cite[lovelace1843]\n',
			'- :cite[turing1936]\n- :cite[lovelace1843]\n',
			'<span>:cite[turing1936]\n\n:cite[lovelace1843]\n',
		]) {
			const found = await parsed(source);
			expect(found.data.citations.cited, source).toEqual([
				'turing1936',
				'lovelace1843',
			]);
			expect(labels_of(found.args), source).toEqual(['cite-1:1', 'cite-2:2']);
		}
	});

	test('author-date on every path', async () => {
		const found = await parsed(':cite[turing1936, lovelace1843]\n', {
			style: 'author-date',
		});
		expect(labels_of(found.args)).toEqual([
			'cite-1:Turing 1936,cite-2:Lovelace 1843',
		]);
	});
});
