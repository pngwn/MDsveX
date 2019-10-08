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

const file_map = [];

const dirs = readdirSync(TEST_DIR).filter(name => name !== 'scripts');
const is_dir = path => existsSync(path) && lstatSync(path).isDirectory();

// Subtests cannot be nested in further subdirectories
// Deep nesting is the devil

const handle_second_level = (dir, dir_path) =>
	readdirSync(dir_path)
		.filter(name => name !== 'scripts')
		.forEach(file => {
			const file_path = resolve(dir_path, file);
			if (is_dir(file_path)) {
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

// everything changed when the mutation nation attacked

export const run = (test, { path, isNew, deleted } = {}) => {
	if (isNew) {
		// add file to map
		// check if its a dir
		const _path = path.split('/');
		if (is_dir(path)) {
			file_map.push([_path[_path.length - 1], path, []]);
		} else {
			file_map.forEach(([dir_name, dir], i) => {
				if (dir === path.replace(`/${[_path[_path.length - 1]]}`, '')) {
					file_map[i][2] = [
						...file_map[i][2],
						[`${dir_name}/${[_path[_path.length - 1]]}`, path],
					];
				}
			});
		}
	} else if (deleted) {
		// on deletion, find it and remove it from the map
		file_map.forEach(([, dir, tests], i) => {
			if (deleted === dir) file_map.splice(i, 1);
			else {
				tests.forEach(([, file], j) => {
					if (file === deleted) {
						file_map[i][2].splice(j, 1);
					}
				});
			}
		});
		// }
	} else if (path) {
		// only delete the cache of the changed file and pray it never breaks
		delete require.cache[path];
	} else {
		// no args means a fresh call so build the whole map
		for (const key in require.cache) {
			delete require.cache[key];
		}
		build_file_map(dirs);
	}
	file_map.forEach(([dir_name, , files]) => {
		test(dir_name, t => {
			files.forEach(([file_name, file_path]) => {
				const test_file = require(file_path).default;
				t.test(file_name, _t => test_file(_t.test, _t.skip));
			});
		});
	});
};
