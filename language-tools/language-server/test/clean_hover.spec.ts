import { describe, it, expect } from "vitest";
import { clean_svelte_hover } from "../src/clean_hover";

describe("clean_svelte_hover", () => {
  it("strips IsomorphicComponent wrapper, keeps only props", () => {
    const input = `\`\`\`typescript
(alias) const Test: __sveltets_2_IsomorphicComponent<{
    value: number;
    label?: string | undefined;
    count?: number | undefined;
}, {
    [evt: string]: CustomEvent<any>;
}, {}, {}, string>
import Test
\`\`\``;

    const result = clean_svelte_hover(input);
    expect(result).toContain("const Test<{");
    expect(result).toContain("value: number;");
    expect(result).not.toContain("__sveltets_2_IsomorphicComponent");
    expect(result).not.toContain("CustomEvent");
    expect(result).not.toContain("[evt: string]");
    expect(result).toContain("import Test");
  });

  it("handles arrow function types in props without breaking", () => {
    const input = `\`\`\`typescript
(alias) const Test: __sveltets_2_IsomorphicComponent<{
    value: number;
    label?: string | undefined;
    count?: number | undefined;
    onClick?: (() => void) | undefined;
}, {
    [evt: string]: CustomEvent<any>;
}, {}, {}, string>
import Test
\`\`\``;

    const result = clean_svelte_hover(input);
    expect(result).toContain("const Test<{");
    expect(result).toContain("onClick?: (() => void) | undefined;");
    expect(result).not.toContain("CustomEvent");
    expect(result).not.toContain("[evt: string]");
    expect(result).toContain("import Test");
    // Should NOT have leftover text from the old definition
    expect(result).not.toContain("}, {");
  });

  it("returns unchanged markdown when no marker present", () => {
    const input = "```typescript\nconst x: number\n```";
    expect(clean_svelte_hover(input)).toBe(input);
  });

  it("handles generic prop types", () => {
    const input = `(alias) const Foo: __sveltets_2_IsomorphicComponent<{
    items: Array<string>;
    map: Map<string, number>;
}, {}, {}, {}, string>
import Foo`;

    const result = clean_svelte_hover(input);
    expect(result).toContain("const Foo<{");
    expect(result).toContain("items: Array<string>;");
    expect(result).toContain("map: Map<string, number>;");
    expect(result).not.toContain("__sveltets_2_IsomorphicComponent");
    expect(result).toContain("import Foo");
  });

  it("strips SvelteComponent type alias from import hover", () => {
    const input = `\`\`\`typescript
(alias) type Test = SvelteComponent<{
    value: number;
    label?: string | undefined;
    count?: number | undefined;
    onClick?: (() => void) | undefined;
}, {
    [evt: string]: CustomEvent<any>;
}, {}> & {
    $$bindings?: string | undefined;
}
(alias) const Test<{
    value: number;
    label?: string | undefined;
    count?: number | undefined;
    onClick?: (() => void) | undefined;
}>
import Test
\`\`\``;

    const result = clean_svelte_hover(input);
    // Should remove the SvelteComponent type alias entirely
    expect(result).not.toContain("SvelteComponent");
    expect(result).not.toContain("$$bindings");
    expect(result).not.toContain("CustomEvent");
    // Should keep the cleaned const + import
    expect(result).toContain("const Test<{");
    expect(result).toContain("onClick?: (() => void) | undefined;");
    expect(result).toContain("import Test");
  });

  it("handles props with no callback types", () => {
    const input = `(alias) const Simple: __sveltets_2_IsomorphicComponent<{
    name: string;
}, {}, {}, {}, string>
import Simple`;

    const result = clean_svelte_hover(input);
    expect(result).toBe(`(alias) const Simple<{
    name: string;
}>
import Simple`);
  });
});
