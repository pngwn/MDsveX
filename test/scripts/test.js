import { lstatSync, existsSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { bgRed } from 'kleur';

const TEST_DIR = resolve(__dirname, '../');

//	file_map
//
//	[
//		[ name, path,
//			[
//				[ name, path ]
//			]
//		]
//	]

let file_map = [];

const dirs = readdirSync(TEST_DIR).filter(name => name !== 'scripts');

// Subtests cannot be nested in further subdirectories
// Deep nesting is the devil

const handle_second_level = (dir, dir_path) =>
	readdirSync(dir_path)
		.filter(name => name !== 'scripts')
		.forEach(file => {
			const file_path = resolve(dir_path, file);

			if (existsSync(file_path) && lstatSync(file_path).isDirectory()) {
				console.log(
					`\n${bgRed(
						'Error: Do not nest test files more than one level deep!'
					)}\n`
				);
				process.exit(1);
			} else {
				const match = file_map.find(v => v[0] === dir && v[1] === dir_path);
				match[2].push([`${dir}/${file}`, file_path]);
			}
		});

// All tests must be in a subdirectory

const handle_top_level = abs_prefix => dir => {
	const dir_path = resolve(abs_prefix, dir);

	if (existsSync(dir_path) && lstatSync(dir_path).isDirectory()) {
		file_map.push([dir, dir_path, []]);
		handle_second_level(dir, dir_path);
	} else {
		throw new Error(
			'No top level test files! Put them in an appropriately named directory.'
		);
	}
};

const build_file_map = dirs => dirs.forEach(handle_top_level(TEST_DIR));

build_file_map(dirs);

export const run = test => {
	file_map = [];
	build_file_map(dirs);

	file_map.forEach(([dir_name, , files]) => {
		test(dir_name, t => {
			files.forEach(([file_name, file_path]) => {
				delete require.cache[file_path];
				const test_file = require(file_path).default;
				t.test(file_name, _t => test_file(_t.test, _t.skip));
			});
		});
	});
};
