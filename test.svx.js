import 'svelte/internal/disclose-version';
import 'svelte/internal/flags/legacy';
import * as $ from 'svelte/internal/client';

var root = $.from_html(`<h1></h1><p></p><p>Some <em>formatted</em> text with <strong>bold</strong> and <code>code</code>.</p>`, 1);

export default function Test_svx($$anchor) {
	let name = 'world';
	let count = 0;
	var fragment = root();
	var h1 = $.first_child(fragment);

	h1.textContent = 'Hello world';

	var p = $.sibling(h1);

	p.textContent = 'The count is 0.';
	$.next();
	$.append($$anchor, fragment);
}
//# sourceMappingURL=test.svx.js.map
