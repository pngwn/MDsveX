import type { Plugin } from '@rollup/browser';
import { parse } from 'acorn';
import { print } from 'esrap';
import ts from 'esrap/languages/ts';
import type {
	ArrowFunctionExpression,
	BlockStatement,
	DoWhileStatement,
	ForStatement,
	FunctionDeclaration,
	FunctionExpression,
	Node,
	Statement,
	WhileStatement,
} from 'estree';
import { walk, type Context } from 'zimmerframe';

const TIMEOUT = 100;

const regex = /\b(for|while)\b/;

function parse_statement(code: string): Statement {
	return parse(code, { ecmaVersion: 'latest' }).body[0] as Statement;
}

const declaration = parse_statement(`
	const __start = Date.now();
`);

const check = parse_statement(`
	if (Date.now() > __start + ${TIMEOUT}) {
		throw new Error('Infinite loop detected');
	}
`);

export function get_current_function(
	path: Node[]
): null | FunctionExpression | FunctionDeclaration | ArrowFunctionExpression {
	for (let i = path.length - 1; i >= 0; i--) {
		const node = path[i];
		if (
			node.type === 'FunctionDeclaration' ||
			node.type === 'FunctionExpression' ||
			node.type === 'ArrowFunctionExpression'
		) {
			return node;
		}
	}
	return null;
}

function loop_protect<
	Statement extends DoWhileStatement | ForStatement | WhileStatement,
>(node: Statement, context: Context<Node, null>): Node | void {
	const current_function = get_current_function(context.path);

	if (
		current_function === null ||
		(!current_function.async && !current_function.generator)
	) {
		const body = context.visit(node.body) as import('estree').Statement;

		const statements = body.type === 'BlockStatement' ? [...body.body] : [body];

		const replacement: BlockStatement = {
			type: 'BlockStatement',
			body: [
				declaration,
				{
					...((context.next() ?? node) as Statement),
					body: {
						type: 'BlockStatement',
						body: [...statements, check],
					},
				},
			],
		};

		return replacement;
	}

	context.next();
}

const plugin: Plugin = {
	name: 'loop-protect',
	transform: (code, id) => {
		// only applies to local files, not imports
		if (!id.startsWith('./')) return;

		if (!id.endsWith('.js') && !id.endsWith('.svelte')) return;

		if (!regex.test(code)) return;

		const ast = parse(code, {
			ecmaVersion: 'latest',
			sourceType: 'module',
		});

		const transformed = walk(ast as Node, null, {
			WhileStatement: loop_protect,
			DoWhileStatement: loop_protect,
			ForStatement: loop_protect,
		});

		if (ast === transformed) return null;

		return print(transformed as any, ts());
	},
};

export default plugin;
