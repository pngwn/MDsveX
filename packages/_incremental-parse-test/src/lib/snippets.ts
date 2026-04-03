export interface Snippet {
	name: string;
	slug: string;
	markdown: string;
}

export interface Section {
	name: string;
	slug: string;
	snippets: Snippet[];
}

export const SECTIONS: Section[] = [
	{
		name: 'Inline',
		slug: 'inline',
		snippets: [
			{
				name: 'Emphasis nesting',
				slug: 'emphasis-nesting',
				markdown: 'Hello *_world_* and ~~deleted~~\n',
			},
			{
				name: 'Superscript',
				slug: 'superscript',
				markdown: 'E = mc^2^ and x^10^\n',
			},
			{
				name: 'Code span',
				slug: 'code-span',
				markdown: 'Use `console.log()` to debug\n',
			},
			{
				name: 'Links and images',
				slug: 'links-and-images',
				markdown: 'Visit [example](https://example.com) or see ![alt](/puppy.jpg)\n',
			},
			{
				name: 'Soft line break',
				slug: 'soft-line-break',
				markdown: 'first line\nsecond line',
			},
			{
				name: 'Hard line break',
				slug: 'hard-line-break',
				markdown: 'first line\\\nsecond line\n',
			},
		],
	},
	{
		name: 'Blocks',
		slug: 'blocks',
		snippets: [
			{
				name: 'Simple paragraph',
				slug: 'simple-paragraph',
				markdown: 'Hello, world!\n',
			},
			{
				name: 'Heading + paragraph',
				slug: 'heading-paragraph',
				markdown: '# Welcome\n\nThis is a paragraph with *strong* and _emphasis_.\n',
			},
			{
				name: 'Code fence',
				slug: 'code-fence',
				markdown: '```javascript\nconst x = 42;\nconsole.log(x);\n```\n',
			},
			{
				name: 'Block quote',
				slug: 'block-quote',
				markdown: '> To be or not to be,\\\n> that is\n> the question.\n',
			},
		],
	},
	{
		name: 'Lists',
		slug: 'lists',
		snippets: [
			{
				name: 'Unordered list',
				slug: 'unordered',
				markdown: '- First item\n- Second item\n- Third item\n',
			},
			{
				name: 'Nested list',
				slug: 'nested',
				markdown: '- Parent\n  - Child\n    - Grandchild\n- Sibling\n',
			},
		],
	},
	{
		name: 'Tables',
		slug: 'tables',
		snippets: [
			{
				name: 'Table with inline',
				slug: 'inline-content',
				markdown: `| Feature | Status | Priority | Owner | Notes |
|:---|:---:|---:|:---|:---|
| Auth flow      |   ✅   |        1 | Pete           | Finished the *OAuth handshake* and *token refresh* logic last week; _needs a review pass_ before merging. |
| Search index   |   🚧   |        2 | Aisha          | *FTS5*  |
| Dark mode      |   ❌   |        3 | Unassigned     | *Blocked* on the \`design system\` tokens — once those land the CSS swap should be straightforward.       |
| Export to PDF   |   🚧   |        4 | Pete           | [Basic generation works](www.google.com)  |
| Onboarding tour |   ❌   |        5 | Aisha          | ![img](/puppy.jpg) |`,
			},
			{
				name: 'Simple table',
				slug: 'simple',
				markdown: `| one | two |
|:---|:---:|
| *Auth flow*     |   ✅   |
| Search index   |   🚧   |`,
			},
			{
				name: 'Header only',
				slug: 'header-only',
				markdown: `| col A | col B |
| --- | --- |
`,
			},
		],
	},
	{
		name: 'Speculation',
		slug: 'speculation',
		snippets: [
			{
				name: 'Unclosed emphasis',
				slug: 'unclosed-emphasis',
				markdown: 'hello *friends\n\nThis *works* fine\n',
			},
			{
				name: 'Unclosed at EOF',
				slug: 'unclosed-eof',
				markdown: 'hello *friends',
			},
			{
				name: 'Unclosed in table',
				slug: 'inline-content',
				markdown: `| Feature | Status | Priority | Owner | Notes |
|:---|:---:|---:|:---|:---|
| Search index   |   🚧   |        2 | Aisha          | *FTS5  |
| Dark mode      |   ❌   |        3 | Unassigned     | Blocked on the \`design system tokens — once those land the CSS swap should be straightforward.       |
| Export to PDF   |   🚧   |        4 | Pete           | [Basic generation works](www.google.com  |
| Onboarding tour |   ❌   |        5 | Aisha          | ![img](/puppy.jp |
| Auth flow      |   ✅   |        1 | Pete           | Finished the *OAuth handshake* and *token refresh* logic last week; _needs a review pass_ before merging. |`,
			}
		],
	},
	{
		name: 'Mixed',
		slug: 'mixed',
		snippets: [
			{
				name: 'Mixed document',
				slug: 'mixed-document',
				markdown: `# Document Title

A paragraph with *strong emphasis* and _regular emphasis_.

Also ~~strikethrough~~ and ^superscript^ work.

## Second heading

### Third heading

\`\`\`python
def hello():
    print("world")
\`\`\`

> A block quote with *formatting*.

- Item one
- Item two
  - Nested item

---

Final paragraph with a [link](/url).
`,
			},
			{
				name: 'Large document',
				slug: 'large-document',
				markdown: "# How to Make Cheese\n\nCheese-making is an ancient process that transforms milk into a preserved, flavourful food. Here's a general overview:\n\n## Basic Ingredients\n\n- *Milk* (cow, goat, sheep, etc.)\n- *Starter culture* (bacteria that acidify the milk)\n- *Rennet* (an enzyme that causes coagulation)\n- *Salt*\n\n---\n\n## The Basic Steps\n\n1. *Heat the milk* to a specific temperature depending on the cheese type (e.g. ~30–32°C for many soft cheeses).\n\n2. *Add starter culture* — beneficial bacteria convert lactose into lactic acid, lowering the pH and beginning to sour the milk.\n\n3. *Add rennet* — this causes the milk proteins (casein) to clump together, forming a semi-solid _curd_ and separating from the liquid _whey_.\n\n4. *Cut the curd* — the size of the cut affects the final texture. Smaller cuts = harder cheese; larger cuts = softer cheese.\n\n5. *Cook and stir* — heating the curds further firms them up and expels more whey.\n\n6. *Drain the whey* — curds are separated from the liquid whey, often using cheesecloth.\n\n7. *Press the curds* — applying pressure removes more moisture and shapes the cheese.\n\n8. *Salt the cheese* — either by rubbing, brining, or mixing salt in directly. This adds flavour and acts as a preservative.\n\n9. *Age (ripen) the cheese* — from days (fresh cheeses like ricotta) to years (aged cheddars, parmesan). During this time, enzymes and bacteria develop complex flavours.\n\n---\n\n## Simple Beginner Cheese: Paneer or Ricotta\n\nIf you want to start simple, *acid-set cheeses* like ricotta require no rennet or cultures — just milk, heat, and an acid like lemon juice or vinegar. Great for first-timers!\n\n---\n\n## Key Variables That Affect the Result\n\n- Type of milk and its fat content\n- Temperature at each stage\n- Type of bacteria/culture used\n- How long and how it's aged\n- Humidity and environment during ageing\n\nCheese-making can go from a simple 30-minute kitchen project to a months-long craft — it's a wonderfully deep rabbit hole!",
			},
		],
	},
];

export function find_section(slug: string): Section | undefined {
	return SECTIONS.find((s) => s.slug === slug);
}

export function find_snippet(section_slug: string, snippet_slug: string): Snippet | undefined {
	const section = find_section(section_slug);
	return section?.snippets.find((s) => s.slug === snippet_slug);
}
