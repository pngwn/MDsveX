import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * copies a built plugin into the node_modules of an app, its package.json and
 * what its files field lists, so a test resolves what npm would publish and
 * never the sources beside it
 */
export function install(app: string, plugin_dir: string): string {
	const pkg = JSON.parse(
		readFileSync(join(plugin_dir, 'package.json'), 'utf8')
	);
	const to = join(app, 'node_modules', pkg.name);
	mkdirSync(to, { recursive: true });
	cpSync(join(plugin_dir, 'package.json'), join(to, 'package.json'));
	for (const entry of pkg.files as string[]) {
		const from = join(plugin_dir, entry);
		if (!existsSync(from))
			throw new Error(`${pkg.name} has no ${entry}, build it before its tests`);
		cpSync(from, join(to, entry), { recursive: true });
	}
	return to;
}

/**
 * an app on disk in a .tmp- directory beside the tests of a package, so
 * svelte and vite resolve from that package, with the plugins installed
 */
export function write_app(
	test_dir: string,
	files: Record<string, string>,
	plugin_dirs: string[] = []
): string {
	const root = mkdtempSync(join(test_dir, '.tmp-app-'));
	const dependencies: Record<string, string> = {};
	for (const dir of plugin_dirs) {
		const to = install(root, dir);
		const pkg = JSON.parse(readFileSync(join(to, 'package.json'), 'utf8'));
		dependencies[pkg.name] = pkg.version;
	}
	const all: Record<string, string> = {
		// vite-plugin-svelte reads the dependencies to find component libraries
		'package.json': JSON.stringify({
			name: 'app',
			private: true,
			type: 'module',
			imports: { '#lib/*': './src/lib/*' },
			dependencies,
		}),
		...files,
	};
	for (const [path, content] of Object.entries(all)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), content);
	}
	return root;
}
