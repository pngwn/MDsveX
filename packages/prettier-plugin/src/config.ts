// the manifest the vite plugin writes, as mdsvex/host names it
const MANIFEST_PATH = 'node_modules/.mdsvex/manifest.json';
const MANIFEST_VERSION = 1;
// a json config holds no functions, so never a frontmatter parser
const CONFIG_FILE = 'mdsvex.config.json';

export type FrontmatterMode = 'auto' | 'yaml' | 'keep';

const read = new Map<string, { mtime: number; custom: boolean | undefined }>();

/** in auto mode frontmatter is kept when the nearest mdsvex config says the project parses it */
export async function formats_frontmatter(
	mode: FrontmatterMode | undefined,
	filepath: string | undefined
): Promise<boolean> {
	if (mode === 'yaml') return true;
	if (mode === 'keep') return false;
	return !(await custom_parse(filepath));
}

async function custom_parse(filepath: string | undefined): Promise<boolean> {
	// prettier in a browser has no files to look at
	if (
		filepath === undefined ||
		typeof process === 'undefined' ||
		!process.versions?.node
	) {
		return false;
	}
	const fs = await import('node:fs');
	const path = await import('node:path');
	let dir = path.dirname(path.resolve(filepath));
	for (;;) {
		const manifest = custom_in(fs, path.join(dir, MANIFEST_PATH));
		if (manifest !== undefined) return manifest;
		if (fs.existsSync(path.join(dir, CONFIG_FILE))) return false;
		const up = path.dirname(dir);
		if (up === dir) return false;
		dir = up;
	}
}

/** frontmatter_parse of a manifest, undefined without one of this version */
function custom_in(
	fs: typeof import('node:fs'),
	file: string
): boolean | undefined {
	let mtime: number;
	try {
		mtime = fs.statSync(file).mtimeMs;
	} catch {
		return undefined;
	}
	const hit = read.get(file);
	if (hit !== undefined && hit.mtime === mtime) return hit.custom;
	let custom: boolean | undefined;
	try {
		const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
		custom =
			manifest.version === MANIFEST_VERSION
				? manifest.frontmatter_parse === true
				: undefined;
	} catch {
		custom = undefined;
	}
	read.set(file, { mtime, custom });
	return custom;
}
