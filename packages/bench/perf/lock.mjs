// a second benchmark on the same machine distorts the first, and not symmetrically between arms
// a lock whose holder pid is dead is stale and the next waiter breaks it

import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

export const LOCK_DIR = '/tmp/mdsvex-perf.lock';
const META = join(LOCK_DIR, 'holder.json');

function read_holder() {
	try {
		return JSON.parse(readFileSync(META, 'utf8'));
	} catch {
		return null;
	}
}

function pid_alive(pid) {
	if (typeof pid !== 'number') return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch (err) {
		// EPERM means the process exists but belongs to another user
		return err.code === 'EPERM';
	}
}

function is_stale() {
	if (!existsSync(LOCK_DIR)) return false;
	const holder = read_holder();
	if (holder === null) {
		// mkdir won but the holder file never landed, allow a grace window
		try {
			return Date.now() - statSync(LOCK_DIR).mtimeMs > 30_000;
		} catch {
			return false;
		}
	}
	return !pid_alive(holder.pid);
}

function try_acquire(label) {
	try {
		mkdirSync(LOCK_DIR);
	} catch (err) {
		if (err.code !== 'EEXIST') throw err;
		return false;
	}
	writeFileSync(
		META,
		JSON.stringify({
			pid: process.pid,
			label,
			cwd: process.cwd(),
			start: Date.now(),
		})
	);
	return true;
}

/** waits for the machine benchmark lock and returns a release function that also runs on exit */
export async function acquire_bench_lock({
	label = 'bench',
	timeout_ms = 4 * 60 * 60_000,
} = {}) {
	const deadline = Date.now() + timeout_ms;
	let announced = false;

	while (!try_acquire(label)) {
		if (is_stale()) {
			const holder = read_holder();
			process.stderr.write(
				`[lock] breaking stale lock held by pid ${holder?.pid ?? '?'} (${holder?.label ?? 'unknown'})\n`
			);
			rmSync(LOCK_DIR, { recursive: true, force: true });
			continue;
		}
		if (!announced) {
			const holder = read_holder();
			const held_for = holder
				? Math.round((Date.now() - holder.start) / 1000)
				: 0;
			process.stderr.write(
				`[lock] waiting: held by pid ${holder?.pid ?? '?'} (${holder?.label ?? 'unknown'}) for ${held_for}s\n`
			);
			announced = true;
		}
		if (Date.now() > deadline) {
			throw new Error(
				`[lock] timed out after ${Math.round(timeout_ms / 1000)}s waiting for ${LOCK_DIR}`
			);
		}
		// jitter so a queue of waiters does not retry in lockstep
		await new Promise((r) =>
			setTimeout(r, 400 + Math.floor(Math.random() * 600))
		);
	}

	let released = false;
	const release = () => {
		if (released) return;
		released = true;
		const holder = read_holder();
		if (holder === null || holder.pid === process.pid) {
			rmSync(LOCK_DIR, { recursive: true, force: true });
		}
	};

	// no signal handlers, the measurement loop is synchronous so a handler would never run and ctrl c would hang
	process.on('exit', release);

	return release;
}

export function lock_status() {
	if (!existsSync(LOCK_DIR)) return { held: false };
	return { held: true, stale: is_stale(), ...read_holder() };
}
