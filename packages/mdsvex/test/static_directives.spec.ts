import { describe, expect, test } from 'vitest';
import { shell_key } from '@mdsvex/render/html-cursor';
import type { Shell } from '@mdsvex/render/html-cursor';
import { CompilerSession, compile, compile_inputs } from '../src/main';
import type { CompileOptions } from '../src/main';
import type { ShellNeed } from '../src/main';
import { ShellError, asset_marker, hole_html, make_shell } from '../src/shells';

const DIRECTIVES = [
	{
		specifier: 'mdsvex:directives',
		names: ['callout', 'badge'],
		static: ['callout'],
	},
];

const DOC = [
	':::callout[Heads *up*](kind=warn)',
	'Read :badge[this] and {count}.',
	':::',
	'',
].join('\n');

const CALLOUT_KEY = shell_key(
	'mdsvex:directives',
	'callout',
	{ kind: 'warn' },
	true,
	true
);

const SHELL: Shell = {
	html: ['<aside class="warn"><strong>', '</strong>', '</aside>'],
	holes: ['label', 'children'],
};

function need(over: Partial<ShellNeed> = {}): ShellNeed {
	return {
		type: 'shell',
		key: 'k',
		specifier: 'mdsvex:directives',
		name: 'callout',
		args: {},
		label: true,
		children: true,
		start: { line: 3, column: 0 },
		...over,
	};
}

/** a compile with the shells a host would give, they are inputs and never options */
function with_shells(
	raw: string,
	options: CompileOptions,
	shells: Map<string, Shell>
): { code: string } {
	const session = new CompilerSession();
	const inputs = compile_inputs(options);
	inputs.shells = shells;
	return session.render(session.parse(raw, inputs), inputs);
}

describe('static directives in compile', () => {
	test('a static directive with no shell renders live', () => {
		const { code } = compile(DOC, { directives: DIRECTIVES });
		expect(code).toContain('callout as Callout_MDSVEX_D_G');
		expect(code).toContain('<Callout_MDSVEX_D_G kind="warn">');
	});

	test('a shell replaces the component, its holes take the label and the body', () => {
		const { code } = with_shells(
			DOC,
			{ directives: DIRECTIVES },
			new Map([[CALLOUT_KEY, SHELL]])
		);
		expect(code).not.toContain('Callout_MDSVEX_D_G');
		// the live badge inside the shell is still a component
		expect(code).toContain(
			"import { badge as Badge_MDSVEX_D_G } from 'mdsvex:directives';"
		);
		expect(code).toContain(
			'<aside class="warn"><strong>Heads <strong>up</strong></strong><p>Read ' +
				'<Badge_MDSVEX_D_G>this</Badge_MDSVEX_D_G> and {count}.</p></aside>'
		);
	});

	test('a document whose only directives are shells runs their module and imports no component', () => {
		const { code } = with_shells(
			':::callout[Heads up](kind=warn)\nbody\n:::\n',
			{ directives: DIRECTIVES },
			new Map([[CALLOUT_KEY, SHELL]])
		);
		// the directives module runs for its side effects, the styles a barrel imports
		expect(code).toBe(
			"<script>\nimport 'mdsvex:directives';\n</script>" +
				'<aside class="warn"><strong>Heads up</strong><p>body</p></aside>'
		);
	});

	test('the imports a shell names join the script once', () => {
		const shell: Shell = {
			...SHELL,
			imports: ['import "/lib/Callout.static.svelte.mdsvex-static.css";\n'],
		};
		const { code } = with_shells(
			':::callout[a](kind=warn)\nx\n:::\n\n:::callout[b](kind=warn)\ny\n:::\n\nUse :badge[it].\n',
			{ directives: DIRECTIVES },
			new Map([[CALLOUT_KEY, shell]])
		);
		expect(code).toContain(
			"<script>\nimport { badge as Badge_MDSVEX_D_G } from 'mdsvex:directives';\n" +
				'import "/lib/Callout.static.svelte.mdsvex-static.css";\n</script>'
		);
	});

	test('another arg is another shell, so that use renders live', () => {
		const { code } = with_shells(
			':::callout[Heads up](kind=info)\nbody\n:::\n',
			{ directives: DIRECTIVES },
			new Map([[CALLOUT_KEY, SHELL]])
		);
		expect(code).toContain('<Callout_MDSVEX_D_G kind="info">');
	});

	test('the parse of a document lists the shells it lacks, once per key', () => {
		const session = new CompilerSession();
		const inputs = compile_inputs({ directives: DIRECTIVES });
		const parsed = session.parse(
			DOC +
				'\n:::callout[Again](kind=warn)\nx\n:::\n\n:::callout[](kind=tip)\n:::\n',
			inputs
		);
		expect(parsed.needs).toEqual([
			{
				type: 'shell',
				key: CALLOUT_KEY,
				specifier: 'mdsvex:directives',
				name: 'callout',
				args: { kind: 'warn' },
				label: true,
				children: true,
				start: { line: 1, column: 0 },
			},
			{
				type: 'shell',
				key: shell_key(
					'mdsvex:directives',
					'callout',
					{ kind: 'tip' },
					false,
					false
				),
				specifier: 'mdsvex:directives',
				name: 'callout',
				args: { kind: 'tip' },
				label: false,
				children: false,
				start: { line: 9, column: 0 },
			},
		]);
	});

	test('a template directive is looked for in the scope the template gives', () => {
		const session = new CompilerSession();
		const inputs = compile_inputs({
			templates: {
				post: {
					specifier: 'mdsvex:template/post',
					directives: [
						{
							specifier: 'mdsvex:template-directives/post',
							names: ['note'],
							static: ['note'],
						},
					],
				},
			},
		});
		const parsed = session.parse(
			'---\ntemplate: post\n---\n\nA :note[pin].\n',
			inputs
		);
		expect(parsed.needs?.map((n) => (n as ShellNeed).name)).toEqual(['note']);
		const other = session.parse('A :note[pin].\n', inputs);
		expect(other.needs).toBeUndefined();
	});

	test('an arg named children throws as it does live', () => {
		expect(() =>
			with_shells(
				':::callout(children=x)\nbody\n:::\n',
				{ directives: DIRECTIVES },
				new Map()
			)
		).toThrow(/has an argument named children/);
	});
});

describe('make_shell', () => {
	test('an asset marker becomes an import and an expression', () => {
		const html =
			'<figure><img src="' +
			asset_marker('/lib/logo.svg') +
			'" alt=""/>' +
			hole_html('children') +
			'</figure>';
		expect(
			make_shell(html, need({ label: false }), undefined, {
				imports: ['import "/x.css";\n'],
				asset: (id) => (id === '/lib/logo.svg' ? 3 : -1),
			})
		).toEqual({
			html: ['<figure><img src="{__mdsvex_asset_3}" alt=""/>', '</figure>'],
			holes: ['children'],
			imports: [
				'import "/x.css";\n',
				'import __mdsvex_asset_3 from "/lib/logo.svg";\n',
			],
		});
	});

	test('drops comments, escapes braces and splits at the holes', () => {
		const html =
			'<!--[--><aside class="{x}"><strong>' +
			hole_html('label') +
			'<!----></strong> ' +
			hole_html('children') +
			'<!----></aside><!--]-->';
		expect(make_shell(html, need())).toEqual({
			html: ['<aside class="&#123;x&#125;"><strong>', '</strong> ', '</aside>'],
			holes: ['label', 'children'],
		});
	});

	test('a snippet the component never renders is an error', () => {
		expect(() => make_shell('<aside></aside>', need(), '/src/doc.svx')).toThrow(
			new ShellError(
				need(),
				'/src/doc.svx',
				'is given label but its component never renders it, a static component renders each snippet it gets exactly once'
			).message
		);
	});

	test('a snippet rendered twice is an error', () => {
		const html =
			hole_html('label') + hole_html('children') + hole_html('children');
		expect(() => make_shell(html, need())).toThrow(
			'[mdsvex] the static directive callout at 3:1 renders children 2 times'
		);
	});
});
