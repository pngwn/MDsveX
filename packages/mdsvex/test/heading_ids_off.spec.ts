import { HeadingIds } from '@mdsvex/parse';
import { afterAll, beforeEach, describe, expect, test, vi } from 'vitest';

import { compile, compile_inputs, CompilerSession } from '../src/main';
import type { CompileOptions, ParsePlugin, TraceTarget } from '../src/main';

const start = vi.spyOn(HeadingIds.prototype, 'start');
const close = vi.spyOn(HeadingIds.prototype, 'close');
afterAll(() => {
	start.mockRestore();
	close.mockRestore();
});
const raw = '# One\n\n## Two\n\ntext\n';
const plugins: ParsePlugin[] = [
	{ heading: { parse() {} } },
	{ sequential: true, heading: { parse() {} } },
];

function target(): TraceTarget {
	return {
		source: '',
		html: '',
		metadata: undefined,
		template: undefined,
		warnings: undefined,
		buf: new Uint32Array(0),
		start: 0,
		split: 0,
		end: 0,
	};
}

/** one compile through each entry point, one-shot and session, eight in all */
function every(options: CompileOptions): void {
	const { parse_plugins } = options;
	const u = undefined;
	compile(raw, options);
	compile(raw, { ...options, sourcemap: true });
	const session = new CompilerSession();
	session.compile(raw, options);
	session.compile(raw, { ...options, sourcemap: true });
	session.compile_v3(raw, 'a.svx', parse_plugins, u, u, u, u, u, u, options);
	session.compile_trace(raw, parse_plugins, u, u, u, u, u, u, options);
	session.compile_trace_into(
		raw,
		parse_plugins,
		target(),
		u,
		u,
		u,
		u,
		u,
		u,
		u,
		options
	);
	const inputs = compile_inputs();
	inputs.parse_plugins = parse_plugins;
	session.compile_into(raw, inputs, target());
}

describe('heading ids', () => {
	// a block, vitest calls a function a hook returns as its cleanup
	beforeEach(() => {
		start.mockClear();
		close.mockClear();
	});

	test('are never made without the option, so no heading pays for them', () => {
		compile(raw);
		new CompilerSession().compile(raw);
		every({});
		every({ heading_ids: false });
		every({ parse_plugins: plugins });
		every({ parse_plugins: plugins, heading_ids: false });
		every({ components: [{ specifier: 'm', names: ['h1'] }] });
		const session = new CompilerSession();
		session.compile(raw, { heading_ids: true });
		session.compile(raw, { parse_plugins: plugins, heading_ids: true });
		start.mockClear();
		close.mockClear();
		session.compile(raw);
		session.compile(raw, { parse_plugins: plugins });
		expect(start).not.toHaveBeenCalled();
		expect(close).not.toHaveBeenCalled();
	});

	test('start once for a document with the option and close once a heading', () => {
		// compile_into takes inputs, which every leaves without the option
		every({ heading_ids: true });
		expect(start).toHaveBeenCalledTimes(7);
		expect(close).toHaveBeenCalledTimes(14);
		every({ heading_ids: true, parse_plugins: plugins });
		expect(start).toHaveBeenCalledTimes(14);
		expect(close).toHaveBeenCalledTimes(28);
	});
});
