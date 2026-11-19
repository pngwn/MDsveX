const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

function export_name(name: string): string {
	return IDENTIFIER.test(name) ? name : JSON.stringify(name);
}

/**
 * the module a template id stands for when a module of extra replacements
 * goes with the template, main and extra are the ids it imports them by
 */
export function template_module(
	main: string,
	extra: string,
	names: readonly string[]
): string {
	const a = JSON.stringify(main);
	const b = JSON.stringify(extra);
	// a named export shadows the same name from export *
	let code = `export * from ${a};\nexport { default } from ${a};\n`;
	if (names.length !== 0)
		code += `export { ${names.map(export_name).join(', ')} } from ${b};\n`;
	return code;
}
