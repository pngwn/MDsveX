module.exports = {
	root: true,
	rules: {
		indent: ['error', 'tab', { SwitchCase: 1 }],
		semi: [2, 'always'],
		'keyword-spacing': [2, { before: true, after: true }],
		'space-before-blocks': [2, 'always'],
		'no-mixed-spaces-and-tabs': [2, 'smart-tabs'],
		'no-cond-assign': 0,
		'no-unused-vars': 2,
		'object-shorthand': [2, 'always'],
		'no-const-assign': 2,
		'no-class-assign': 2,
		'no-this-before-super': 2,
		'no-var': 2,
		'no-unreachable': 2,
		'valid-typeof': 2,
		'quote-props': [2, 'as-needed'],
		'one-var': [2, 'never'],
		'prefer-arrow-callback': 2,
		'prefer-const': [2, { destructuring: 'all' }],
		'arrow-spacing': 2,
		'no-inner-declarations': 0,
	},
	ignorePatterns: ['/node_modules/', '/test/_fixtures/'],
	env: {
		es6: true,
		browser: true,
		node: true,
		jest: true,
	},
	extends: ['eslint:recommended'],
	parserOptions: {
		ecmaVersion: 9,
		sourceType: 'module',
		ecmaFeatures: {
			experimentalObjectRestSpread: true,
		},
	},
	settings: {
		'import/resolver': {
			node: {
				extensions: ['.js'],
			},
		},
	},
};
