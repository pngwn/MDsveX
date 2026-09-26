// reference builds live next to the main checkout so every worktree measures against the same bytes

import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export const perf_root = here;

export const local_root = resolve(here, '../../..');

// --git-common-dir is the one real .git directory even from a linked worktree
export const main_root = (() => {
	try {
		const common = execFileSync(
			'git',
			['rev-parse', '--path-format=absolute', '--git-common-dir'],
			{ cwd: local_root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
		).trim();
		return dirname(common);
	} catch {
		return local_root;
	}
})();

export const perf_dir = process.env.MDSVEX_PERF_DIR
	? resolve(process.env.MDSVEX_PERF_DIR)
	: join(main_root, '.perf');

export const baseline_dir = join(perf_dir, 'baseline');
export const mirror_dir = join(perf_dir, 'baseline-mirror');
export const reference_stamp = join(perf_dir, 'REFERENCE.json');
