import { describe, expect, test } from "vitest";

import { migrate } from "../src/main";

const m = (input: string): string => migrate(input).replace(/\n$/, "");

describe("svelte expressions", () => {
	test("markdown characters in an expression are not escaped", () => {
		expect(m("Value {items[0]} and {a_b * c_d}.")).toBe("Value {items[0]} and {a_b * c_d}.");
		expect(m("# Title {post_title}")).toBe("# Title {post_title}");
		expect(m("{x ? `a` : 'b_c'} and *em*")).toBe("{x ? `a` : 'b_c'} and _em_");
	});

	test("a brace in a string does not end the expression", () => {
		expect(m("{a ? '}' : `${b}_c`} *x*")).toBe("{a ? '}' : `${b}_c`} _x_");
	});

	test("an expression in a link, an image and emphasis", () => {
		expect(m("[*go*]({base}/a_b) ![x]({src_url})")).toBe("[_go_]({base}/a_b) ![x]({src_url})");
		expect(m("**{total_count}** items")).toBe("*{total_count}* items");
	});

	test("braces in code are code", () => {
		expect(m("Use `{a_b}` here.")).toBe("Use `{a_b}` here.");
		expect(m("```js\nconst a = {b_c};\n```")).toBe("```js\nconst a = {b_c};\n```");
		expect(m("> ```js\n> const a = {b_c};\n> ```")).toBe("> ```js\n> const a = {b_c};\n> ```");
	});
});

describe("svelte blocks", () => {
	test("a block tag on its own line is a block", () => {
		expect(m("{#if a_b}\n\n*yes*\n\n{:else}\n\nno\n\n{/if}")).toBe(
			"{#if a_b}\n\n_yes_\n\n{:else}\n\nno\n\n{/if}",
		);
	});

	test("a close tag after a list is not a line of its last item", () => {
		expect(m("{#each items as item (item.id)}\n- {item.name}\n{/each}")).toBe(
			"{#each items as item (item.id)}\n\n- {item.name}\n\n{/each}",
		);
	});

	test("a block tag beside text stays in its paragraph", () => {
		expect(m("{#if a_b}yes{:else}no{/if} *x*")).toBe("{#if a_b}yes{:else}no{/if} _x_");
	});

	test("html and const tags", () => {
		expect(m("{@html post_html}")).toBe("{@html post_html}");
		expect(m("{@const a_b = c[0]}")).toBe("{@const a_b = c[0]}");
	});
});

describe("svelte tags", () => {
	test("a svelte element is not an autolink", () => {
		expect(m("<svelte:head>\n<title>x</title>\n</svelte:head>")).toBe(
			"<svelte:head>\n<title>x</title>\n</svelte:head>",
		);
		expect(m("<svelte:window on:keydown={on_key} />")).toBe(
			"<svelte:window on:keydown={on_key} />",
		);
		expect(m("text <svelte:component this={A_b} /> more")).toBe(
			"text <svelte:component this={A_b} /> more",
		);
	});

	test("attributes commonmark does not read", () => {
		const tags = [
			"<Comp on:click={() => a*b} bind:value={v_1}>",
			"<button on:click|preventDefault={go_now}>",
			"<Box --gap=\"1_2\" {...rest_props} {shorthand_prop} />",
			"<div class:is_active={a > b} use:tip={{ text: 'a_b' }}>",
			"<Tabs.Panel name=\"a_b\">",
		];
		for (const tag of tags) expect(m(tag)).toBe(tag);
		for (const tag of tags) expect(m(`a ${tag} *b*`)).toBe(`a ${tag} _b_`);
	});

	test("a tag over lines", () => {
		const tag = "<Comp\n\ta_b={c_d}\n\ton:click={() => go()}\n/>";
		expect(m(tag)).toBe(tag);
	});

	test("markdown inside a component is still migrated", () => {
		expect(m("<Box a={b_c}>\n\n**strong** text\n\n</Box>")).toBe(
			"<Box a={b_c}>\n\n*strong* text\n\n</Box>",
		);
	});

	test("script and style are kept as written", () => {
		const script = "<script>\n\tlet a_b = [1, 2];\n\tconst c = a_b[0] * 2;\n</script>";
		const style = "<style>\n\th1 { color: red; }\n</style>";
		expect(m(script + "\n\n" + style)).toBe(script + "\n\n" + style);
	});

	test("an html element is still an element", () => {
		expect(m("a <b>*x*</b> and <span class=\"a_b\">y</span>")).toBe(
			"a <b>_x_</b> and <span class=\"a_b\">y</span>",
		);
	});

	test("a document that holds a token like text", () => {
		expect(m("mdsvexmigrateq0e {a_b}")).toBe("mdsvexmigrateq0e {a_b}");
	});
});
