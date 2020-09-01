import * as path from 'path';
import * as fs from 'fs';

import { parse } from '../src/main';

const fixtures = path.join(__dirname, 'fixtures');

const inputs_paths = fs
	.readdirSync(fixtures, { encoding: 'utf-8' })
	.map((f) =>
		f.startsWith('error')
			? false
			: fs.readFileSync(path.join(fixtures, f, 'input.svelte'), {
					encoding: 'utf-8',
			  })
	)
	.filter(Boolean);

inputs_paths.forEach((f) => {
	console.log('=====================');
	console.log(f);
	console.log(
		JSON.stringify(
			parse({ value: f as string, generatePositions: false }),
			null,
			2
		)
	);
});

// <div style='color: {color};'>{color}</div>

// {
//   "type": "root",
//   "children": [
//     {
//       "type": "svelteElement",
//       "tagName": "div",
//       "properties": [
//         {
//           "type": "svelteProperty",
//           "name": "style",
//           "value": [
//             {
//               "type": "text",
//               "value": "color:"
//             },
//             {
//               "type": "text",
//               "value": ""
//             },
//             {
//               "type": "svelteExpression",
//               "value": "color;"  <======================================= WRONG
//             }
//           ],
//           "modifiers": [],
//           "shorthand": "none"
//         }
//       ],
//       "selfClosing": false,
//       "children": [
//         {
//           "type": "svelteExpression",
//           "value": "color"
//         }
//       ]
//     }
//   ]
// }

// <a href=https://www.google.com>Google</a>

// {
//   "type": "root",
//   "children": [
//     {
//       "type": "svelteElement",
//       "tagName": "a",
//       "properties": [
//         {
//           "type": "svelteProperty",
//           "name": "href",
//           "value": [
//             {
//               "type": "text",
//               "value": "https:" <================================= WRONG
//             }
//           ],
//           "modifiers": [],
//           "shorthand": "none"
//         }
//       ],
//       "selfClosing": true,
//       "children": []
//     }
//   ]
// }

// <div/>
// {
//   "type": "root",
//   "children": [
//     {
//       "type": "svelteElement",
//       "tagName": "div/", <============================= WRONG
//       "properties": [],
//       "selfClosing": false,
//       "children": []
//     }
//   ]
//}

// {@htmlfoo}

// {
//   "type": "root",
//   "children": [
//     {
//       "type": "svelteVoidBlock",
//       "name": "htmlfoo}\n", <======================== WRONG
//       "expression": {
//         "type": "svelteExpression",
//         "value": ""
//       }
//     }
//   ]
// }
