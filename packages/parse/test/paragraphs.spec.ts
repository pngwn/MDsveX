import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import { parse_markdown_svelte, token_kind } from '../src/main';

const this_dir = dirname(fileURLToPath(import.meta.url));
const fixtures_root = resolve(this_dir, '../../pfm-tests/tests/paragraphs');

const load_fixture = (id: string): string =>
  readFileSync(resolve(fixtures_root, id, 'input.md'), 'utf8');

const to_array = (view: Uint8Array | Uint16Array | Uint32Array): number[] => Array.from(view);

describe('paragraphs', () => {
  test('pfm example 219 splits adjacent paragraphs', () => {
    const input = load_fixture('219');
    const { tokens } = parse_markdown_svelte(input);

    expect(tokens.size).toBe(5);
    expect(to_array(tokens.kinds_slice())).toEqual([
      token_kind.text,
      token_kind.line_break,
      token_kind.line_break,
      token_kind.text,
      token_kind.line_break
    ]);
    expect(to_array(tokens.starts_slice())).toEqual([0, 3, 4, 5, 8]);
    expect(to_array(tokens.ends_slice())).toEqual([3, 4, 5, 8, 9]);
  });

  test('pfm example 220 keeps single blank line as paragraph separator', () => {
    const input = load_fixture('220');
    const { tokens } = parse_markdown_svelte(input);

    expect(tokens.size).toBe(9);
    expect(to_array(tokens.kinds_slice())).toEqual([
      token_kind.text,
      token_kind.line_break,
      token_kind.text,
      token_kind.line_break,
      token_kind.line_break,
      token_kind.text,
      token_kind.line_break,
      token_kind.text,
      token_kind.line_break
    ]);
    expect(to_array(tokens.starts_slice())).toEqual([0, 3, 4, 7, 8, 9, 12, 13, 16]);
    expect(to_array(tokens.ends_slice())).toEqual([3, 4, 7, 8, 9, 12, 13, 16, 17]);
  });

  test('pfm example 221 treats multiple blank lines as separators', () => {
    const input = load_fixture('221');
    const { tokens } = parse_markdown_svelte(input);

    expect(tokens.size).toBe(6);
    expect(to_array(tokens.kinds_slice())).toEqual([
      token_kind.text,
      token_kind.line_break,
      token_kind.line_break,
      token_kind.line_break,
      token_kind.text,
      token_kind.line_break
    ]);
    expect(to_array(tokens.starts_slice())).toEqual([0, 3, 4, 5, 6, 9]);
    expect(to_array(tokens.ends_slice())).toEqual([3, 4, 5, 6, 9, 10]);
  });

  test('pfm example 222 trims leading spaces inside a paragraph', () => {
    const input = load_fixture('222');
    const { tokens } = parse_markdown_svelte(input);

    expect(tokens.size).toBe(4);
    expect(to_array(tokens.kinds_slice())).toEqual([
      token_kind.text,
      token_kind.line_break,
      token_kind.text,
      token_kind.line_break
    ]);
    expect(to_array(tokens.starts_slice())).toEqual([2, 5, 7, 10]);
    expect(to_array(tokens.ends_slice())).toEqual([5, 6, 10, 11]);
  });

  test('pfm example 223 collapses indented continuation lines', () => {
    const input = load_fixture('223');
    const { tokens } = parse_markdown_svelte(input);

    expect(tokens.size).toBe(6);
    expect(to_array(tokens.kinds_slice())).toEqual([
      token_kind.text,
      token_kind.line_break,
      token_kind.text,
      token_kind.line_break,
      token_kind.text,
      token_kind.line_break
    ]);
    expect(to_array(tokens.starts_slice())).toEqual([0, 3, 17, 20, 60, 63]);
    expect(to_array(tokens.ends_slice())).toEqual([3, 4, 20, 21, 63, 64]);
  });

  test('pfm example 224 tolerates up to three leading spaces', () => {
    const input = load_fixture('224');
    const { tokens } = parse_markdown_svelte(input);

    expect(tokens.size).toBe(4);
    expect(to_array(tokens.kinds_slice())).toEqual([
      token_kind.text,
      token_kind.line_break,
      token_kind.text,
      token_kind.line_break
    ]);
    expect(to_array(tokens.starts_slice())).toEqual([3, 6, 7, 10]);
    expect(to_array(tokens.ends_slice())).toEqual([6, 7, 10, 11]);
  });

  test('pfm example 225 does not turn four-space indents into code fences', () => {
    const input = load_fixture('225');
    const { tokens } = parse_markdown_svelte(input);

    expect(tokens.size).toBe(4);
    expect(to_array(tokens.kinds_slice())).toEqual([
      token_kind.text,
      token_kind.line_break,
      token_kind.text,
      token_kind.line_break
    ]);
    expect(to_array(tokens.starts_slice())).toEqual([4, 7, 8, 11]);
    expect(to_array(tokens.ends_slice())).toEqual([7, 8, 11, 12]);
  });
});
