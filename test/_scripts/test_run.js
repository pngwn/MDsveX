const { createHarness } = require('zora');

import { run } from './test';
import { reporter } from './reporter';

const verbose = process.argv[2] === '--verbose';

const report = harness => harness.report(reporter(verbose));

const run_tests = async (opts = {}) => {
	const harness = createHarness();
	const { test } = harness;

	const r = run(test, opts);

	console.log(r);

	report(harness);
};

run_tests();
