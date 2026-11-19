import type { Plugin } from '@rollup/browser';

function escape(str: string) {
	return str.replace(/[-[\]/{}()*+?.\\^$|]/g, '\\$&');
}

function ensure_function(function_or_value: unknown) {
	if (typeof function_or_value === 'function') {
		return function_or_value;
	}
	return function () {
		return function_or_value;
	};
}

function longest(a: string, b: string) {
	return b.length - a.length;
}

function map_to_functions(object: Record<string, unknown>) {
	return Object.keys(object).reduce(function (
		functions: Record<string, Function>,
		key
	) {
		functions[key] = ensure_function(object[key]);
		return functions;
	}, {});
}

function replace(options: Record<string, unknown>): Plugin {
	const function_values = map_to_functions(options);
	const keys = Object.keys(function_values).sort(longest).map(escape);

	const pattern = new RegExp('\\b(' + keys.join('|') + ')\\b', 'g');

	return {
		name: 'replace',

		transform: function transform(code, id) {
			let has_replacements = false;
			let match;
			let start;
			let end;
			let replacement;

			code = code.replace(pattern, (_, key) => {
				has_replacements = true;
				return String(function_values[key](id));
			});

			if (!has_replacements) {
				return null;
			}

			return {
				code,
				map: null,
			};
		},
	};
}

export default replace;
