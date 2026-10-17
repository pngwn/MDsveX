#!/usr/bin/env node
// packs every public package, installs the tarballs outside the repo and type checks every entry
// under node16, nodenext and bundler with strict and skipLibCheck off, build the packages first
// vite is installed for the mdsvex entry, every other entry is checked again and must not load it

import { execFileSync } from 'node:child_process';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const keep = process.argv.includes('--keep');
const shell = process.platform === 'win32';

// peers the declarations need, at the version of the package that declares them
const peers = ['svelte', 'prettier', 'typescript', 'vite', '@types/node'];
const with_vite = new Set(['mdsvex', 'mdsvex/globals']);
// a tsserver plugin loaded by path, it publishes no declarations
const no_types = new Set(['@mdsvex/typescript-plugin']);

const modes = {
	node16: { module: 'node16', moduleResolution: 'node16' },
	nodenext: { module: 'nodenext', moduleResolution: 'nodenext' },
	bundler: { module: 'preserve', moduleResolution: 'bundler' },
};

function run(cmd, args, cwd) {
	return execFileSync(cmd, args, {
		cwd,
		encoding: 'utf8',
		shell,
		stdio: 'pipe',
	});
}

function public_packages() {
	const dirs = [];
	for (const group of ['packages', 'plugins', 'language-tools']) {
		for (const name of readdirSync(join(root, group))) {
			const dir = join(root, group, name);
			const file = join(dir, 'package.json');
			if (!existsSync(file)) continue;
			const pkg = JSON.parse(readFileSync(file, 'utf8'));
			if (pkg.private || no_types.has(pkg.name)) continue;
			dirs.push({ dir, pkg });
		}
	}
	return dirs;
}

function peer_version(name, packages) {
	const declaring = packages.filter(({ pkg }) => pkg.peerDependencies?.[name]);
	for (const { dir } of [...declaring, { dir: root }]) {
		try {
			const req = createRequire(join(dir, 'package.json'));
			return JSON.parse(
				readFileSync(req.resolve(`${name}/package.json`), 'utf8')
			).version;
		} catch {}
	}
	throw new Error(`no installed ${name} to take a version from`);
}

/** the subpaths a consumer can import, with the file its types resolve to */
function entries(name, pkg) {
	if (!pkg.exports) return [{ spec: name, types: pkg.types ?? 'index.d.ts' }];
	const out = [];
	for (const [key, value] of Object.entries(pkg.exports)) {
		if (key === './package.json' || key.endsWith('.css') || key.includes('*'))
			continue;
		const types = typeof value === 'string' ? value : value.types;
		out.push({ spec: key === '.' ? name : name + key.slice(1), types });
	}
	return out;
}

const work = mkdtempSync(join(tmpdir(), 'mdsvex-types-'));
let failed = false;

try {
	const packages = public_packages();
	const tarballs = join(work, 'tarballs');
	mkdirSync(tarballs);

	const files = {};
	for (const { dir, pkg } of packages) {
		const before = new Set(readdirSync(tarballs));
		run('pnpm', ['pack', '--pack-destination', tarballs], dir);
		const tgz = readdirSync(tarballs).find((f) => !before.has(f));
		files[pkg.name] = `file:${join(tarballs, tgz).replaceAll('\\', '/')}`;
	}

	const project = join(work, 'project');
	mkdirSync(project);
	const dependencies = { ...files };
	for (const peer of peers) dependencies[peer] = peer_version(peer, packages);
	writeFileSync(
		join(project, 'package.json'),
		JSON.stringify(
			{
				name: 'check',
				private: true,
				type: 'module',
				dependencies,
				pnpm: { overrides: files },
			},
			null,
			'\t'
		)
	);
	writeFileSync(
		join(project, '.npmrc'),
		'auto-install-peers=false\nstrict-peer-dependencies=false\n'
	);
	console.log(`installing ${packages.length} tarballs in ${project}`);
	run(
		'pnpm',
		['install', '--ignore-workspace', '--prefer-offline', '--reporter=silent'],
		project
	);

	const lines = { all: [], without_vite: [] };
	let n = 0;
	for (const { pkg } of packages) {
		const installed = join(project, 'node_modules', pkg.name);
		const published = JSON.parse(
			readFileSync(join(installed, 'package.json'), 'utf8')
		);
		for (const { spec, types } of entries(pkg.name, published)) {
			const text =
				types?.endsWith('.d.ts') && existsSync(join(installed, types))
					? readFileSync(join(installed, types), 'utf8')
					: '';
			// an ambient file such as mdsvex/globals is not a module, it is referenced
			const line =
				text && !/^(import|export)\b/m.test(text)
					? `/// <reference types="${spec}" />`
					: `import * as e${n++} from '${spec}';`;
			for (const [name, list] of Object.entries(lines)) {
				if (name === 'without_vite' && with_vite.has(spec)) continue;
				if (line.startsWith('///')) list.unshift(line);
				else list.push(line);
			}
		}
	}
	for (const [name, list] of Object.entries(lines)) {
		writeFileSync(
			join(project, `${name}.ts`),
			list.join('\n') + '\nexport {};\n'
		);
	}
	const real = realpathSync(project) + '/';

	const tsc = createRequire(join(root, 'package.json')).resolve(
		'typescript/bin/tsc'
	);
	const check = (config, ...flags) =>
		execFileSync(process.execPath, [tsc, '-p', config, ...flags], {
			cwd: project,
			encoding: 'utf8',
			stdio: 'pipe',
		});
	for (const [mode, options] of Object.entries(modes)) {
		for (const name of Object.keys(lines)) {
			writeFileSync(
				join(project, `tsconfig.${mode}.${name}.json`),
				JSON.stringify({
					compilerOptions: {
						...options,
						target: 'es2022',
						strict: true,
						skipLibCheck: false,
						noEmit: true,
					},
					files: [`${name}.ts`],
				})
			);
		}
		try {
			check(`tsconfig.${mode}.all.json`);
			const vite = check(
				`tsconfig.${mode}.without_vite.json`,
				'--listFilesOnly'
			)
				.split('\n')
				.filter((file) => /[\\/]node_modules[\\/]vite[\\/]/.test(file));
			if (vite.length) {
				failed = true;
				console.log(
					`${mode}: entries other than ${[...with_vite].join(' and ')} load vite`
				);
				console.log(vite.map((file) => file.replace(real, '')).join('\n'));
			} else {
				console.log(`${mode}: ok, ${n} entries`);
			}
		} catch (error) {
			failed = true;
			const out = String(error.stdout || error.message).trim();
			const count = (out.match(/error TS\d+/g) || []).length;
			console.log(`${mode}: ${count} errors`);
			console.log(out.replaceAll(real, ''));
		}
	}
} finally {
	if (keep) console.log(`kept ${relative(process.cwd(), work) || work}`);
	else rmSync(work, { recursive: true, force: true });
}

process.exit(failed ? 1 : 0);
