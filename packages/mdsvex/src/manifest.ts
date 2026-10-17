/**
 * what the vite plugin resolved and scanned, written for editors, which can
 * not run vite to learn the templates and replacements a document compiles with
 */
import { MANIFEST_PATH, queue_manifest } from './manifest_core.js';
import type { MdsvexManifest } from './manifest_core.js';

export {
	MANIFEST_PATH,
	MANIFEST_VERSION,
	manifest_json,
	manifest_resolver,
	queue_manifest,
} from './manifest_core.js';
export type {
	ManifestMath,
	ManifestModule,
	ManifestOutput,
	ManifestPlugin,
	ManifestTemplate,
	MdsvexManifest,
} from './manifest_core.js';

/** the manifest queue of the plugin, a failure warns once */
export function manifest_writer(
	build: () => MdsvexManifest | null,
	warn: (message: string) => void
) {
	const file_of = async (root: string) =>
		(await import('node:path')).join(root, MANIFEST_PATH);
	return queue_manifest(build, {
		async write(root, json) {
			const fs = await import('node:fs/promises');
			const path = await import('node:path');
			const file = await file_of(root);
			await fs.mkdir(path.dirname(file), { recursive: true });
			// a rename never leaves an editor reading half a file
			const tmp = `${file}.${Math.random().toString(36).slice(2)}.tmp`;
			await fs.writeFile(tmp, json);
			await fs.rename(tmp, file);
		},
		async failed(e, root) {
			warn(
				`could not write ${await file_of(root)} for editor tooling: ${(e as Error).message}`
			);
		},
	});
}
