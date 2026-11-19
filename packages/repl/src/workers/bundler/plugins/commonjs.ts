import type { Plugin } from '@rollup/browser';
import { parse } from 'acorn';
import type { Node } from 'estree';
import { walk } from 'zimmerframe';

const require = `function require(id) {
	if (id in __repl_lookup) return __repl_lookup[id];
	throw new Error(\`Cannot require modules dynamically (\${id})\`);
}`;

const plugin: Plugin = {
	name: 'commonjs',

	transform: (code, id) => {
		if (
			id.endsWith('.mjs') ||
			id.endsWith('.esm.js') ||
			code.startsWith('import ') ||
			!/\b(require|module|exports)\b/.test(code)
		) {
			return;
		}

		try {
			const ast = parse(code, {
				ecmaVersion: 'latest',
			});

			const requires: string[] = [];
			const exports: Set<string> = new Set();

			walk(ast as Node, null, {
				CallExpression: (node, context) => {
					if (
						node.callee.type === 'Identifier' &&
						node.callee.name === 'require'
					) {
						if (node.arguments.length !== 1) return;
						const arg = node.arguments[0];
						if (arg.type !== 'Literal' || typeof arg.value !== 'string') return;

						requires.push(arg.value);
					}

					context.next();
				},
				AssignmentExpression: (node, context) => {
					context.next();

					if (node.operator !== '=') return;
					if (node.left.type !== 'MemberExpression') return;
					if (
						node.left.object.type !== 'Identifier' ||
						node.left.object.name !== 'exports'
					)
						return;
					if (node.left.computed || node.left.property.type !== 'Identifier')
						return;

					// a default property would produce invalid syntax
					if (node.left.property.name !== 'default') {
						exports.add(node.left.property.name);
					}
				},
			});

			const imports = requires
				.map((id, i) => `import __repl_${i} from '${id}';`)
				.join('\n');
			const lookup = `const __repl_lookup = { ${requires
				.map((id, i) => `'${id}': __repl_${i}`)
				.join(', ')} };`;

			// css.escape reads this as the global, which is undefined in a module
			if (id.includes('css.escape')) {
				code = code.replace(
					"typeof global != 'undefined' ? global : this",
					'globalThis'
				);
			}

			const transformed = [
				imports,
				lookup,
				require,
				`const exports = {}; const module = { exports };`,
				code,
				`export default module.exports;`,
				...Array.from(exports).map((name) => {
					const alias = `$$module_exports_${name}`;
					return `const ${alias} = module.exports.${name}; export { ${alias} as ${name} };`;
				}),
			].join('\n\n');

			return {
				code: transformed,
				map: null,
			};
		} catch (err) {
			return null;
		}
	},
};

export default plugin;
