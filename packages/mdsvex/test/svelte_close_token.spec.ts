import { compile as svelte_compile } from 'svelte/compiler';
import { describe, expect, test } from 'vitest';

import { compile } from '../src/main';

function rejected(code: string): { code: string; at: string } {
	try {
		svelte_compile(code, { filename: 'doc.svelte' });
	} catch (error) {
		const found = error as { code: string; position: [number, number] };
		const at = found.position[0] - 1;
		return { code: found.code, at: code.slice(at, at + 7) };
	}
	throw new Error('svelte compiled it');
}

describe('a close token of another name than its block', () => {
	test('is written as it was, so svelte reports it', () => {
		const { code } = compile('{#if a}\nx\n{/each}\n{/if}\n');
		expect(code).toBe('{#if a}\n<p>x\n{/each}</p>{/if}');
		expect(rejected(code)).toEqual({
			code: 'block_unexpected_close',
			at: '{/each}',
		});
	});

	test('two blocks closed in the wrong order do not compile', () => {
		const { code } = compile(
			'{#if ready}\n{#each items as item}\n{item}\n{/if}\n{/each}\n'
		);
		expect(code).toContain('{item}\n{/if}</p>{/each}');
		expect(rejected(code).code).toBe('block_unexpected_close');
	});

	test('two blocks closed in order compile', () => {
		const { code } = compile(
			'{#if ready}\n{#each items as item}\n{item}\n{/each}\n{/if}\n'
		);
		expect(code).toBe(
			'{#if ready}\n{#each items as item}\n<p>{item}</p>{/each}{/if}'
		);
		expect(() =>
			svelte_compile(code, { filename: 'doc.svelte' })
		).not.toThrow();
	});
});
