#!/usr/bin/env node
// build the frozen reference arms every a/b measures against
//
//   node packages/bench/perf/bin/setup-baseline.mjs [--ref <commit>] [--force]
//
// the mirror is a second independent build of the same commit, only calibrate.mjs uses it
// the ref defaults to next, falling back to origin/next

import { execFileSync } from 'node:child_process';
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { local_root, perf_dir, reference_stamp } from '../paths.mjs';
import { BUILD_ARGS, missing_dist } from '../workloads.mjs';

const argv = process.argv.slice(2);
const opt = (name, fallback = null) => {
	const i = argv.indexOf(`--${name}`);
	return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--')
		? argv[i + 1]
		: fallback;
};
const force = argv.includes('--force');

function capture(cmd, args) {
	return execFileSync(cmd, args, {
		cwd: local_root,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'ignore'],
	}).trim();
}

function resolve_ref(ref) {
	try {
		return capture('git', ['rev-parse', '--verify', `${ref}^{commit}`]);
	} catch {
		return null;
	}
}

const requested = opt('ref');
const candidates = requested ? [requested] : ['next', 'origin/next'];
const ref = candidates.find((r) => resolve_ref(r) !== null);
if (!ref) {
	console.error(`cannot resolve ${candidates.join(' or ')} to a commit`);
	process.exit(2);
}
const sha = resolve_ref(ref);
const short = sha.slice(0, 12);
const arms = ['baseline', 'baseline-mirror'].map((name) =>
	join(perf_dir, name)
);

if (existsSync(reference_stamp) && !force) {
	const stamp = JSON.parse(readFileSync(reference_stamp, 'utf8'));
	if (
		stamp.sha === sha &&
		arms.every((dir) => missing_dist(dir).length === 0)
	) {
		console.log(`reference already built at ${short} (${stamp.built_at})`);
		for (const dir of arms) console.log(`  ${dir}`);
		console.log('pass --force to rebuild.');
		process.exit(0);
	}
}

// empty the directory rather than removing it, in ci it can be a mount point
if (existsSync(perf_dir)) {
	for (const entry of readdirSync(perf_dir)) {
		rmSync(join(perf_dir, entry), { recursive: true, force: true });
	}
} else {
	mkdirSync(perf_dir, { recursive: true });
}

const build_seconds = {};
for (const dir of arms) {
	mkdirSync(dir, { recursive: true });
	console.log(`\n=== ${dir} @ ${short} (${ref}) ===`);
	const tar = execFileSync('git', ['archive', '--format=tar', sha], {
		cwd: local_root,
		maxBuffer: 1024 * 1024 * 1024,
	});
	execFileSync('tar', ['-x', '-C', dir], {
		input: tar,
		maxBuffer: 1024 * 1024 * 1024,
	});
	const t0 = Date.now();
	execFileSync('pnpm', ['install', '--frozen-lockfile'], {
		cwd: dir,
		stdio: 'inherit',
	});
	const t1 = Date.now();
	execFileSync('pnpm', BUILD_ARGS, { cwd: dir, stdio: 'inherit' });
	const t2 = Date.now();
	build_seconds[dir] = {
		install: (t1 - t0) / 1000,
		build: (t2 - t1) / 1000,
	};
	const missing = missing_dist(dir);
	if (missing.length > 0) {
		console.error(`build did not produce:\n  ${missing.join('\n  ')}`);
		process.exit(1);
	}
}

writeFileSync(
	reference_stamp,
	`${JSON.stringify(
		{
			sha,
			ref,
			subject: capture('git', ['log', '-1', '--format=%s', sha]),
			built_at: new Date().toISOString(),
			build_seconds,
			node: process.version,
		},
		null,
		'\t'
	)}\n`
);

console.log(`\nreference built at ${short}`);
for (const [dir, t] of Object.entries(build_seconds)) {
	console.log(`  ${dir}  install ${t.install}s, build ${t.build}s`);
}
