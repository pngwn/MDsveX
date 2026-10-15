import type { PluginContext } from 'mdsvex/compile';

/** a date as the function of last_modified gives it */
export type Modified = string | Date | undefined;

export type LastModified =
	| 'git'
	| 'fs'
	| ((filename: string) => Modified | Promise<Modified>);

/** the date of a document as an ISO string, undefined for none */
export type ModifiedOf = (
	filename: string,
	ctx: PluginContext
) => Promise<string | undefined>;

export type FailCode = 'option' | 'node' | 'git';
type Fail = (code: FailCode, message: string) => Error;

/** true where node:child_process and node:fs can be imported, deno and bun say they are node */
export function has_node(): boolean {
	const versions = (
		globalThis as { process?: { versions?: { node?: string } } }
	).process?.versions;
	return typeof versions?.node === 'string';
}

/** a Date or a string a Date can read, as an ISO string */
function iso(value: unknown, fail: Fail): string | undefined {
	if (value === undefined) return undefined;
	const date =
		value instanceof Date
			? value
			: typeof value === 'string'
				? new Date(value)
				: undefined;
	if (date === undefined || Number.isNaN(date.getTime())) {
		throw fail(
			'option',
			`last_modified must give a date, a string a Date can read or undefined, it gave ${value instanceof Date ? 'an invalid Date' : JSON.stringify(value)}`
		);
	}
	return date.toISOString();
}

/** imported on first use, so the package loads where node is not */
async function node() {
	const [child_process, fs, path] = await Promise.all([
		import('node:child_process'),
		import('node:fs/promises'),
		import('node:path'),
	]);
	return { child_process, fs, path };
}

type Node = Awaited<ReturnType<typeof node>>;

/** the path with its links resolved, as git names it, undefined when there is no such file */
async function real(n: Node, filename: string): Promise<string | undefined> {
	try {
		return await n.fs.realpath(filename);
	} catch (error) {
		if ((error as { code?: string }).code === 'ENOENT') return undefined;
		throw error;
	}
}

class GitFailed extends Error {
	constructor(
		readonly status: number | null,
		readonly stderr: string
	) {
		super(stderr);
	}
}

/** what git writes to stdout, without the limit of execFile */
function git(n: Node, cwd: string, args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		const child = n.child_process.spawn('git', args, {
			cwd,
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		let out = '';
		let err = '';
		child.stdout.setEncoding('utf8');
		child.stderr.setEncoding('utf8');
		child.stdout.on('data', (chunk: string) => (out += chunk));
		child.stderr.on('data', (chunk: string) => (err += chunk));
		child.on('error', reject);
		child.on('close', (status: number | null) => {
			if (status === 0) resolve(out);
			else reject(new GitFailed(status, err.trim()));
		});
	});
}

/** the last commit of each file of a repository, by its path from the top */
interface History {
	dates: Map<string, string>;
	/** the paths whose last commit is where a shallow clone was cut, so it is a guess */
	cut: Set<string>;
}

const COMMIT = '\x01';

/**
 * one git log for the whole repository, newest first, the first commit
 * that names a path is its last
 */
async function history(n: Node, root: string, fail: Fail): Promise<History> {
	const dates = new Map<string, string>();
	const cut = new Set<string>();
	// a repository with no commit yet has no history, and git log fails for it
	const empty = await git(n, root, [
		'rev-parse',
		'-q',
		'--verify',
		'HEAD',
	]).then(
		() => false,
		() => true
	);
	if (empty) return { dates, cut };
	const [log, shallow] = await Promise.all([
		git(n, root, [
			'log',
			`--format=${COMMIT}%H %cI %P`,
			'--name-only',
			'--no-renames',
			'-z',
		]),
		git(n, root, ['rev-parse', '--git-path', 'shallow']).then((path) =>
			n.fs.readFile(n.path.resolve(root, path.trim()), 'utf8').then(
				(text: string) =>
					new Set(text.split('\n').filter((line: string) => line !== '')),
				() => new Set<string>()
			)
		),
	]).catch((error) => {
		throw fail(
			'git',
			`last_modified is 'git' and git could not read the history of ${root}: ${(error as Error).message}`
		);
	});
	let date = '';
	let boundary = false;
	for (const token of log.split('\0')) {
		if (token.startsWith(COMMIT)) {
			const [hash, written] = token.slice(1).split(' ');
			date = new Date(written).toISOString();
			boundary = shallow.has(hash);
			continue;
		}
		// the list of a commit starts on a line of its own
		const path = token.startsWith('\n') ? token.slice(1) : token;
		if (path === '' || dates.has(path)) continue;
		dates.set(path, date);
		if (boundary) cut.add(path);
	}
	return { dates, cut };
}

function not_found(filename: string, ctx: PluginContext): undefined {
	ctx.warn(
		'not_found',
		`${filename} is not a file, so it has no last modified date`
	);
	return undefined;
}

function by_git(fail: Fail): ModifiedOf {
	return async (filename, ctx) => {
		const n = await node();
		const file = await real(n, filename);
		if (file === undefined) return not_found(filename, ctx);
		const dir = n.path.dirname(file);
		// one git process for each directory and one log for each repository, for every document
		const root = await ctx.cached(`git_root:${dir}`, () =>
			git(n, dir, ['rev-parse', '--show-toplevel']).then(
				(out) => out.trim(),
				(error) => {
					throw fail(
						'git',
						(error as { code?: string }).code === 'ENOENT'
							? `last_modified is 'git' and git could not be run: ${(error as Error).message}`
							: `last_modified is 'git' and ${filename} is not inside a git repository: ${(error as Error).message}`
					);
				}
			)
		);
		const { dates, cut } = await ctx.cached(`git_log:${root}`, () =>
			history(n, root, fail)
		);
		const path = n.path.relative(root, file).split(n.path.sep).join('/');
		if (cut.has(path)) {
			ctx.warn(
				'shallow_history',
				`the history of ${filename} was cut by a shallow clone, so the date of its last commit is not known, fetch the whole history (fetch-depth: 0)`
			);
			return undefined;
		}
		// a file that is not committed has no date
		return dates.get(path);
	};
}

function by_fs(): ModifiedOf {
	return async (filename, ctx) => {
		const n = await node();
		try {
			return (await n.fs.stat(filename)).mtime.toISOString();
		} catch (error) {
			if ((error as { code?: string }).code !== 'ENOENT') throw error;
			return not_found(filename, ctx);
		}
	};
}

/** how the date of a document is found, undefined when last_modified is off */
export function last_modified_of(
	option: unknown,
	fail: Fail
): ModifiedOf | undefined {
	if (option === undefined || option === false) return undefined;
	if (typeof option === 'function') {
		const given = option as (filename: string) => Modified | Promise<Modified>;
		return async (filename) => iso(await given(filename), fail);
	}
	if (option !== 'git' && option !== 'fs') {
		throw fail(
			'option',
			`last_modified must be 'git', 'fs' or a function, got ${JSON.stringify(option)}`
		);
	}
	if (!has_node()) {
		throw fail(
			'node',
			`last_modified is '${option}', which needs node, give last_modified a function to find the date here`
		);
	}
	return option === 'git' ? by_git(fail) : by_fs();
}
