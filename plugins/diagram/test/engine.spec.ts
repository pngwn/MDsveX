import { describe, expect, test } from 'vitest';

import { DiagramError, installed, pick_engine } from '../src/engine';

const has =
	(...names: string[]) =>
	(name: string) =>
		names.includes(name);

describe('the engine', () => {
	test('auto takes pele first, then mermaid', () => {
		expect(pick_engine('auto', has('pele', 'mermaid'))).toBe('pele');
		expect(pick_engine('auto', has('mermaid'))).toBe('mermaid');
		expect(pick_engine('auto', has('pele'))).toBe('pele');
	});

	test('auto with neither installed names both and how to install them', () => {
		expect(() => pick_engine('auto', has())).toThrow(DiagramError);
		try {
			pick_engine('auto', has());
		} catch (error) {
			expect((error as DiagramError).code).toBe('no_engine');
			expect((error as Error).message).toContain('pnpm add -D pele');
			expect((error as Error).message).toContain('pnpm add -D mermaid');
		}
	});

	test('an engine named in the options must be installed', () => {
		expect(pick_engine('mermaid', has('pele', 'mermaid'))).toBe('mermaid');
		try {
			pick_engine('pele', has('mermaid'));
			expect.unreachable();
		} catch (error) {
			expect((error as DiagramError).code).toBe('engine_missing');
			expect((error as Error).message).toContain('pnpm add -D pele');
		}
	});

	test('a package that resolves, or exports nothing to require, is installed', () => {
		expect(installed('pele')).toBe(true);
		expect(installed('mermaid')).toBe(true);
		expect(installed('not-a-package-of-this-repo')).toBe(false);
		const not_exported = () => {
			throw Object.assign(new Error('no'), {
				code: 'ERR_PACKAGE_PATH_NOT_EXPORTED',
			});
		};
		expect(installed('x', not_exported)).toBe(true);
	});
});
