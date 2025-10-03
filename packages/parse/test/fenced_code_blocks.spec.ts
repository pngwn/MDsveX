import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import { parse_markdown_svelte, token_kind } from '../src/main';

const this_dir = dirname(fileURLToPath(import.meta.url));
const fixtures_root = resolve(this_dir, '../../pfm-tests/tests/fenced_code_blocks');

const load_fixture = (id: string): string =>
  readFileSync(resolve(fixtures_root, id, 'input.md'), 'utf8');

const to_array = (view: Uint8Array | Uint16Array | Uint32Array): number[] => Array.from(view);

describe('fenced code blocks', () => {
  test('pfm example 119 captures the entire fenced block as a single token', () => {
    const input = load_fixture('119');
    const { tokens } = parse_markdown_svelte(input);

    expect(tokens.size).toBe(2);
    expect(to_array(tokens.kinds_slice())).toEqual([
      token_kind.code_fence,
      token_kind.line_break
    ]);
    expect(to_array(tokens.starts_slice())).toEqual([0, 12]);
    expect(to_array(tokens.ends_slice())).toEqual([12, 13]);
    expect(input.slice(tokens.value_start_at(0), tokens.value_end_at(0))).toBe(`<
 >
`);
  });

  test('pfm example 120 treats tilde fences equivalently to backticks', () => {
    const input = load_fixture('120');
    const { tokens } = parse_markdown_svelte(input);

    expect(tokens.size).toBe(2);
    expect(to_array(tokens.kinds_slice())).toEqual([
      token_kind.code_fence,
      token_kind.line_break
    ]);
    expect(to_array(tokens.starts_slice())).toEqual([0, 12]);
    expect(to_array(tokens.ends_slice())).toEqual([12, 13]);
    expect(input.slice(tokens.value_start_at(0), tokens.value_end_at(0))).toBe(`<
 >
`);
  });

  test('pfm example 121 requires at least three fence characters', () => {
    const input = load_fixture('121');
    const { tokens } = parse_markdown_svelte(input);

    expect(
      to_array(tokens.kinds_slice()).filter((kind) => kind === token_kind.code_fence)
    ).toEqual([]);
  });

  test('pfm example 138 rejects info strings containing backticks', () => {
    const input = load_fixture('138');
    const { tokens } = parse_markdown_svelte(input);

    expect(
      to_array(tokens.kinds_slice()).filter((kind) => kind === token_kind.code_fence)
    ).toEqual([]);
  });

  test('pfm example 142 keeps the code content separate from the info string', () => {
    const input = load_fixture('142');
    const { tokens } = parse_markdown_svelte(input);

    expect(tokens.size).toBe(2);
    expect(tokens.kind_at(0)).toBe(token_kind.code_fence);
    expect(input.slice(tokens.value_start_at(0), tokens.value_end_at(0))).toBe(
      `def foo(x)
  return 3
end
`
    );
  });

  test('pfm example 143 supports complex info strings on tilde fences', () => {
    const input = load_fixture('143');
    const { tokens } = parse_markdown_svelte(input);

    expect(tokens.size).toBe(2);
    expect(tokens.kind_at(0)).toBe(token_kind.code_fence);
    expect(input.slice(tokens.value_start_at(0), tokens.value_end_at(0))).toBe(
      `def foo(x)
  return 3
end
`
    );
  });

  test('pfm example 145 falls back to inline code when info string contains backticks', () => {
    const input = load_fixture('145');
    const { tokens } = parse_markdown_svelte(input);

    expect(
      to_array(tokens.kinds_slice()).filter((kind) => kind === token_kind.code_fence)
    ).toEqual([]);
  });

  test('pfm example 146 allows backticks in info strings for tilde fences', () => {
    const input = load_fixture('146');
    const { tokens } = parse_markdown_svelte(input);

    expect(tokens.size).toBe(2);
    expect(tokens.kind_at(0)).toBe(token_kind.code_fence);
    expect(input.slice(tokens.value_start_at(0), tokens.value_end_at(0))).toBe('foo\n');
  });
});
