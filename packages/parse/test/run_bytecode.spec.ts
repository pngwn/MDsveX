import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, test } from 'vitest';

// v8 never optimizes a function over 61440 bytes of bytecode, so an oversized
// _run keeps the whole state machine in baseline code, the margin is for new states
const MAX_RUN_BYTECODE = 55000;

const DIST = fileURLToPath(new URL('../dist/main.js', import.meta.url));

describe('PFMParser._run', () => {
	test.skipIf(!existsSync(DIST))(
		'bytecode stays below the turbofan size limit',
		() => {
			const script =
				`const m = await import(${JSON.stringify(pathToFileURL(DIST).href)});` +
				`m.parse_markdown_svelte('# a\\n\\n- b *c*\\n');`;
			const result = spawnSync(
				process.execPath,
				[
					'--print-bytecode',
					'--print-bytecode-filter=_run',
					'--input-type=module',
					'-e',
					script,
				],
				{ encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }
			);
			expect(result.status).toBe(0);
			const match = /Bytecode length: (\d+)/.exec(result.stdout);
			expect(match).not.toBeNull();
			expect(Number(match![1])).toBeLessThan(MAX_RUN_BYTECODE);
		}
	);
});
