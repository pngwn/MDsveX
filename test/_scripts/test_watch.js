import { resolve } from 'path';
import CheapWatch from 'cheap-watch';
const { createHarness } = require('zora');

import { run } from './test';
import { reporter } from './reporter';

const verbose = process.argv[2] === '--verbose';

const report = harness => harness.report(reporter(verbose));

const run_tests = (opts = {}) => {
	const harness = createHarness();
	const { test } = harness;

	run(test, opts);
	report(harness);
};

const watch = async () => {
	run_tests();
	const watcher = new CheapWatch({ dir: process.cwd(), debounce: 20 });
	await watcher.init();

	watcher.on('+', ({ path, isNew }) => {
		if (resolve(process.cwd(), path).includes(__dirname)) return;
		run_tests({
			path: resolve(process.cwd(), path),
			isNew,
			isDir: watcher.paths.get(path),
		});
	});

	watcher.on('-', ({ path }) => {
		if (resolve(process.cwd(), path).includes(__dirname)) return;
		run_tests({ deleted: resolve(process.cwd(), path) });
	});
};

watch();
