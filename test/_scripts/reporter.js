import {
	black,
	red,
	green,
	blue,
	cyan,
	bgRed,
	bgGreen,
	bgYellow,
	bold,
} from 'kleur';

import diff from 'jest-diff';

const print = (message, offset = 0) => {
	console.log(black(message.padStart(message.length + offset * 4))); // 4 white space used as indent (see tap-parser)
};

const printBailout = message => {
	// console.log(message);
	console.log(bgRed('Bail out! Unhandled error.'));
	console.log(message.data.stack);
	//print('Bail out! Unhandled error.', message.data, message.offset);
};

const printSummary = harness => {
	print(
		`\n${cyan().bold(harness.suites)} suites. ${cyan().bold(
			harness.tests
		)} tests. ${cyan().bold(harness.assertions)} assertions. in: ${cyan().bold(
			harness.time
		)}ms\n`
	);
	print(harness.pass ? bgGreen(` ok `) : bgRed(` not ok `));
	print(
		'\n' +
			bgGreen(` success: ${harness.passed} `) +
			' ' +
			bgRed(` failure: ${harness.failed} `) +
			' ' +
			bgYellow(` skipped: ${harness.skipped} `)
	);
};

// I might clean this up at some point

export const reporter = verbose => async stream => {
	console.clear();
	print('TAP version 13');

	const output = [];
	for await (const message of stream) {
		output.push(message);
	}

	const results = [];
	let cat = -1;
	let suite = -1;
	let test = -1;
	let testCount = 0;
	let suiteCount = 0;
	let assertionCount = 0;
	let time = 0;

	for (let i = 0; i < output.length; i++) {
		if (output[i].type === 'BAIL_OUT') printBailout(output[i]);
		// directory
		if (output[i].offset === 0) {
			if (output[i].type === 'TEST_START') {
				cat++;
				results.push({
					name: output[i].data.description,
					pass: false,
					suites: [],
				});
			} else if (output[i].type === 'ASSERTION') {
				results[cat].performance = output[i].data.executionTime;
				results[cat].pass = output[i].data.pass;
				time += output[i].data.executionTime;
				suite = -1;
			}
		}

		// suite
		if (output[i].offset === 1) {
			if (output[i].type === 'TEST_START') {
				suite++;
				suiteCount++;
				results[cat].suites.push({
					name: output[i].data.description,
					pass: false,
					tests: [],
				});
			} else if (output[i].type === 'ASSERTION') {
				results[cat].suites[suite].performance = output[i].data.executionTime;
				results[cat].suites[suite].pass = output[i].data.pass;
				test = -1;
			}
		}

		// test
		if (output[i].offset === 2) {
			if (output[i].type === 'TEST_START') {
				test++;
				testCount++;
				results[cat].suites[suite].tests.push({
					name: output[i].data.description,
					pass: false,
					assertions: [],
				});
			} else if (output[i].type === 'ASSERTION') {
				results[cat].suites[suite].tests[test].performance =
					output[i].data.executionTime;
				results[cat].suites[suite].tests[test].pass = output[i].data.pass;
			}
		}

		// assertion
		if (output[i].offset === 3 && output[i].type === 'ASSERTION') {
			assertionCount++;
			results[cat].suites[suite].tests[test].assertions.push({
				name: output[i].data.description,
				pass: output[i].data.pass,
				performance: output[i].data.executionTime,
				data: {
					expected: output[i].data.expected,
					actual: output[i].data.actual,
					operator: output[i].data.operator,
					id: output[i].data.id,
				},
			});
		}
	}

	results.forEach(({ name, suites }) => {
		print(green().bold(`\n> ${name}`));
		suites.forEach(({ name, tests, pass }) => {
			const label = pass ? bgGreen(` ok `) : bgRed(` not ok `);
			print(
				`${verbose ? '\n' : ''}  ${label} ${
					!verbose ? green(tests.length) : ''
				} ${blue().bold(name)}`
			);
			if (verbose) {
				tests.forEach(({ name, pass }) => {
					const test_label = pass
						? green(`✓ ${name}`)
						: red(`${bold('✕')} ${name}`);
					print(`    ${test_label}`);
				});
			}
		});
	});
	// }

	if (!stream.pass) {
		print(red('\n\n  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄'));
		print(`${red('  ██')}${bgRed(` FAILURES `)}${red('██')}`);
		print(red('  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀'));
		results.forEach(({ name: section_name, suites, pass: section_pass }) => {
			if (!section_pass) {
				print(red().bold(`\n> ${section_name}`));
				suites.forEach(({ name: suite_name, tests, pass: suite_pass }) => {
					if (!suite_pass) {
						if (verbose) {
							tests.forEach(
								({ name: test_name, pass: test_pass, assertions }) => {
									if (test_pass) return;
									const test_label =
										bgRed(` not ok `) +
										' ' +
										bold(suite_name) +
										'\n\n  ' +
										bold('desc: ') +
										test_name;

									assertions.forEach(
										({
											name: assertion_name,
											pass: assertion_pass,
											data: { actual, expected, operator },
										}) => {
											if (assertion_pass) return;
											print(`\n  ${test_label} - ${assertion_name}`);
											print(`  ${bold('operator:')} ${cyan(operator)}\n`);
											print(
												diff(actual, expected, {})
													.split('\n')
													.map(s => `  ${s}`)
													.join('\n')
											);
										}
									);
								}
							);
						}
					}
				});
			}
		});
	}

	const meta = {
		pass: stream.pass,
		passed: stream.successCount,
		failed: stream.failureCount,
		skipped: stream.skipCount,
		suites: suiteCount,
		tests: testCount,
		assertions: assertionCount,
		time,
	};

	printSummary(meta);
};
