import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../src/heading_ids', async (original) => {
	const actual = await original<typeof import('../src/heading_ids')>();
	return {
		...actual,
		assign_heading_ids: vi.fn(actual.assign_heading_ids),
	};
});

import { assign_heading_ids } from '../src/heading_ids';
import { compile, compile_inputs, CompilerSession } from '../src/main';
import type { CompileOptions, ParsePlugin, TraceTarget } from '../src/main';

const pass = vi.mocked(assign_heading_ids);
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

describe('the heading id pass', () => {
	// a block, vitest calls a function a hook returns as its cleanup
	beforeEach(() => {
		pass.mockClear();
	});

	test('never runs without the option, so nothing walks the tree', () => {
		compile(raw);
		new CompilerSession().compile(raw);
		every({});
		every({ heading_ids: false });
		every({ parse_plugins: plugins });
		every({ parse_plugins: plugins, heading_ids: false });
		every({ components: [{ specifier: 'm', names: ['h1'] }] });
		expect(pass).not.toHaveBeenCalled();
	});

	test('runs once for a document with the option', () => {
		// compile_into takes inputs, which every leaves without the option
		every({ heading_ids: true });
		expect(pass).toHaveBeenCalledTimes(7);
		every({ heading_ids: true, parse_plugins: plugins });
		expect(pass).toHaveBeenCalledTimes(14);
	});
});
