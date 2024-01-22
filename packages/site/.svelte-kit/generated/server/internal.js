
import root from '../root.svelte';
import { set_building } from '__sveltekit/environment';
import { set_assets } from '__sveltekit/paths';
import { set_private_env, set_public_env } from '../../../../../node_modules/.pnpm/@sveltejs+kit@1.26.0_svelte@4.2.2_vite@4.5.0/node_modules/@sveltejs/kit/src/runtime/shared-server.js';

export const options = {
	app_template_contains_nonce: false,
	csp: {"mode":"auto","directives":{"upgrade-insecure-requests":false,"block-all-mixed-content":false},"reportOnly":{"upgrade-insecure-requests":false,"block-all-mixed-content":false}},
	csrf_check_origin: true,
	track_server_fetches: false,
	embedded: false,
	env_public_prefix: 'PUBLIC_',
	env_private_prefix: '',
	hooks: null, // added lazily, via `get_hooks`
	preload_strategy: "modulepreload",
	root,
	service_worker: false,
	templates: {
		app: ({ head, body, assets, nonce, env }) => "<!DOCTYPE html>\n<html lang=\"en\">\n\t<head>\n\t\t<meta content=\"width=device-width, initial-scale=1.0\" name=\"viewport\" />\n\t\t<meta charset=\"utf-8\" />\n\n\t\t<link rel=\"stylesheet\" href=\"global.css\" />\n\t\t<link rel=\"manifest\" href=\"manifest.json\" />\n\t\t<link rel=\"preload\" as=\"image\" href=\"/penguin.gif\" />\n\t\t<link rel=\"preload\" as=\"image\" href=\"/penguin_static.gif\" />\n\n\t\t<link\n\t\t\trel=\"icon\"\n\t\t\ttype=\"image/png\"\n\t\t\tsizes=\"192x192\"\n\t\t\thref=\"/android-icon-192x192.png\"\n\t\t/>\n\t\t<link rel=\"icon\" type=\"image/png\" sizes=\"32x32\" href=\"/favicon-32x32.png\" />\n\t\t<link rel=\"icon\" type=\"image/png\" sizes=\"96x96\" href=\"/favicon-96x96.png\" />\n\t\t<link rel=\"icon\" type=\"image/png\" sizes=\"16x16\" href=\"/favicon-16x16.png\" />\n\n\t\t<!-- Primary Meta Tags -->\n\t\t<meta name=\"title\" content=\"mdsvex - svelte in markdown\" />\n\t\t<meta\n\t\t\tname=\"description\"\n\t\t\tcontent=\"Combine svelte and markdown in the same file. Live your dreams!\"\n\t\t/>\n\n\t\t<!-- Open Graph / Facebook -->\n\t\t<meta property=\"og:type\" content=\"website\" />\n\t\t<meta property=\"og:url\" content=\"https://mdsvex.com/\" />\n\t\t<meta property=\"og:title\" content=\"mdsvex - svelte in markdown\" />\n\t\t<meta\n\t\t\tproperty=\"og:description\"\n\t\t\tcontent=\"Combine svelte and markdown in the same file. Live your dreams!\"\n\t\t/>\n\t\t<meta property=\"og:image\" content=\"https://mdsvex.com/og.png\" />\n\n\t\t<!-- Twitter -->\n\t\t<meta property=\"twitter:card\" content=\"summary_large_image\" />\n\t\t<meta property=\"twitter:url\" content=\"https://mdsvex.com/\" />\n\t\t<meta property=\"twitter:title\" content=\"mdsvex - svelte in markdown\" />\n\t\t<meta\n\t\t\tproperty=\"twitter:description\"\n\t\t\tcontent=\"Combine svelte and markdown in the same file. Live your dreams!\"\n\t\t/>\n\t\t<meta property=\"twitter:image\" content=\"https://mdsvex.com/og.png\" />\n\n\t\t" + head + "\n\t</head>\n\n\t<body>\n\t\t<div id=\"main\">" + body + "</div>\n\n    <!-- Cloudflare Web Analytics --><script defer src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{\"token\": \"590d70c530b74f41b117351532dd6809\"}'></script><!-- End Cloudflare Web Analytics -->\n\t</body>\n</html>\n",
		error: ({ status, message }) => "<!DOCTYPE html>\n<html lang=\"en\">\n\t<head>\n\t\t<meta charset=\"utf-8\" />\n\t\t<title>" + message + "</title>\n\n\t\t<style>\n\t\t\tbody {\n\t\t\t\t--bg: white;\n\t\t\t\t--fg: #222;\n\t\t\t\t--divider: #ccc;\n\t\t\t\tbackground: var(--bg);\n\t\t\t\tcolor: var(--fg);\n\t\t\t\tfont-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,\n\t\t\t\t\tUbuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;\n\t\t\t\tdisplay: flex;\n\t\t\t\talign-items: center;\n\t\t\t\tjustify-content: center;\n\t\t\t\theight: 100vh;\n\t\t\t\tmargin: 0;\n\t\t\t}\n\n\t\t\t.error {\n\t\t\t\tdisplay: flex;\n\t\t\t\talign-items: center;\n\t\t\t\tmax-width: 32rem;\n\t\t\t\tmargin: 0 1rem;\n\t\t\t}\n\n\t\t\t.status {\n\t\t\t\tfont-weight: 200;\n\t\t\t\tfont-size: 3rem;\n\t\t\t\tline-height: 1;\n\t\t\t\tposition: relative;\n\t\t\t\ttop: -0.05rem;\n\t\t\t}\n\n\t\t\t.message {\n\t\t\t\tborder-left: 1px solid var(--divider);\n\t\t\t\tpadding: 0 0 0 1rem;\n\t\t\t\tmargin: 0 0 0 1rem;\n\t\t\t\tmin-height: 2.5rem;\n\t\t\t\tdisplay: flex;\n\t\t\t\talign-items: center;\n\t\t\t}\n\n\t\t\t.message h1 {\n\t\t\t\tfont-weight: 400;\n\t\t\t\tfont-size: 1em;\n\t\t\t\tmargin: 0;\n\t\t\t}\n\n\t\t\t@media (prefers-color-scheme: dark) {\n\t\t\t\tbody {\n\t\t\t\t\t--bg: #222;\n\t\t\t\t\t--fg: #ddd;\n\t\t\t\t\t--divider: #666;\n\t\t\t\t}\n\t\t\t}\n\t\t</style>\n\t</head>\n\t<body>\n\t\t<div class=\"error\">\n\t\t\t<span class=\"status\">" + status + "</span>\n\t\t\t<div class=\"message\">\n\t\t\t\t<h1>" + message + "</h1>\n\t\t\t</div>\n\t\t</div>\n\t</body>\n</html>\n"
	},
	version_hash: "1avqltl"
};

export function get_hooks() {
	return {};
}

export { set_assets, set_building, set_private_env, set_public_env };
