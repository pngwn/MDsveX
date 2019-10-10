const dotAllPolyfill = '[\0-\uFFFF]';

const attributeName = '[a-zA-Z_:][a-zA-Z0-9:._-]*';
const unquoted = '[^"\'=<>`\\u0000-\\u0020]+';
const singleQuoted = "'[^']*'";
const doubleQuoted = '"[^"]*"';
const jsProps = '{.*}'.replace('.', dotAllPolyfill);
const attributeValue =
	'(?:' +
	unquoted +
	'|' +
	singleQuoted +
	'|' +
	doubleQuoted +
	'|' +
	jsProps +
	')';
const attribute =
	'(?:\\s+' + attributeName + '(?:\\s*=\\s*' + attributeValue + ')?)';
const openTag = '<[A-Za-z]*[A-Za-z0-9\\.\\-]*' + attribute + '*\\s*\\/?>';
const closeTag = '<\\/[A-Za-z][A-Za-z0-9\\.\\-]*\\s*>';
const comment = '<!---->|<!--(?:-?[^>-])(?:-?[^-])*-->';
const processing = '<[?].*?[?]>'.replace('.', dotAllPolyfill);
const declaration = '<![A-Za-z]+\\s+[^>]*>';
const cdata = '<!\\[CDATA\\[[\\s\\S]*?\\]\\]>';

export const openCloseTag = new RegExp('^(?:' + openTag + '|' + closeTag + ')');

export const tag = new RegExp(
	'^(?:' +
		openTag +
		'|' +
		closeTag +
		'|' +
		comment +
		'|' +
		processing +
		'|' +
		declaration +
		'|' +
		cdata +
		')'
);
