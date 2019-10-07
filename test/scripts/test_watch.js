import CheapWatch from 'cheap-watch';
const { createHarness } = require('zora');

import { run } from './test';
import { mochaTapLike } from './reporter';

// console.log(process.argv[2], process.argv[3] === '--verbose');

const report = harness =>
	harness.report(mochaTapLike(process.argv[2] === '--verbose'));

const run_tests = () => {
	const harness = createHarness();
	const { test } = harness;

	run(test);
	report(harness);
};

const watch = async () => {
	run_tests();
	const watcher = new CheapWatch({ dir: process.cwd() });
	await watcher.init();

	watcher.on('+', args => {
		console.log(args);
		// run_tests();
	});
};

watch();
