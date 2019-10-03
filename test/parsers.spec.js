import { parse_svelte_tag } from '../src/parsers';

// I have no idea what the unified/ remark eat function returns but i need to fake it.
const eat = value => node => ({
  value,
  node,
});

describe('parse_svelte_tag', () => {
  test('it should correctly match and parse any svelte tag: component', () => {
    const input = '<svelte:component />';

    const output = parse_svelte_tag(eat, input, false);

    expect(output).toEqual({
      value: '<svelte:component />',
      node: {
        value: '<svelte:component />',
        name: 'component',
        type: 'svelteTag',
      },
    });
  });
});
