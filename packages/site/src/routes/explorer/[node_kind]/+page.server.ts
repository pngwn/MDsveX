import { redirect } from "@sveltejs/kit";
import fs from "fs";
import path from "path";

import type { PageServerLoad } from "./$types";

function get_first_sample(kind: string) {
	return fs.readdirSync(
		path.join(
			import.meta.dirname,

			"..",
			"..",
			"..",
			"..",
			"..",
			"pfm-tests",
			"tests",
			kind,
		),
	)[0];
}

export const load: PageServerLoad = async ({ params }) => {
	const { node_kind } = params;
	console.log("node_kind", node_kind);

	if (!node_kind) {
		throw redirect(302, "/explorer/atx_headings");
	}

	let url = "";

	try {
		const test_cases = get_first_sample(node_kind);
		console.log("test_cases", test_cases);

		url = `/explorer/${node_kind}/${test_cases}`;
	} catch (e) {
		console.error(e);
		url = "/explorer/atx_headings";
	}

	throw redirect(302, url);
};
