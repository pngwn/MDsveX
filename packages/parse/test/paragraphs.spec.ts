import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import { node_kind, parse_markdown_svelte, token_kind } from '../src/main';

const this_dir = dirname(fileURLToPath(import.meta.url));
const fixtures_root = resolve(this_dir, '../../pfm-tests/tests/paragraphs');

const load_fixture = (id: string): string =>
  readFileSync(resolve(fixtures_root, id, 'input.md'), 'utf8');

const to_array = (view: Uint8Array | Uint16Array | Uint32Array): number[] => Array.from(view);

const collect_children = (
  arena: ReturnType<typeof parse_markdown_svelte>['arena'],
  parent: number
): number[] => {
  const children: number[] = [];
  for (let index = 0; index < arena.size; index += 1) {
    if (arena.get_parent(index) === parent) {
      children.push(index);
    }
  }
  return children;
};

const expect_paragraph_nodes = (
  tokens: ReturnType<typeof parse_markdown_svelte>['tokens'],
  arena: ReturnType<typeof parse_markdown_svelte>['arena'],
  root: number
): void => {
  const text_tokens: number[] = [];
  for (let index = 0; index < tokens.size; index += 1) {
    if (tokens.kind_at(index) === token_kind.text) {
      text_tokens.push(index);
    }
  }

  const root_children = collect_children(arena, root);
  const paragraph_nodes = root_children.filter(
    (index) => arena.get_kind(index) === node_kind.paragraph
  );

  expect(paragraph_nodes.length).toBe(text_tokens.length);

  const remaining = new Set(paragraph_nodes);
  for (const token_index of text_tokens) {
    const start = tokens.start_at(token_index);
    const end = tokens.end_at(token_index);
    let matched_node = -1;
    for (const node_index of remaining) {
      if (arena.get_start(node_index) === start && arena.get_end(node_index) === end) {
        matched_node = node_index;
        break;
      }
    }

    expect(matched_node).not.toBe(-1);
    remaining.delete(matched_node);

    const children = collect_children(arena, matched_node);
    const value_start = tokens.value_start_at(token_index);
    const value_end = tokens.value_end_at(token_index);

    if (value_end > value_start) {
      expect(children).toHaveLength(1);
      const text_child = children[0];
      expect(arena.get_kind(text_child)).toBe(node_kind.text);
      expect(arena.get_start(text_child)).toBe(value_start);
      expect(arena.get_end(text_child)).toBe(value_end);
    } else {
      expect(children).toHaveLength(0);
    }
  }

  expect(remaining.size).toBe(0);
};

describe('paragraphs', () => {
  test('pfm example 219 splits adjacent paragraphs', () => {
    const input = load_fixture('219');
    const { tokens, arena, root } = parse_markdown_svelte(input);

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

    expect_paragraph_nodes(tokens, arena, root);
  });

  test('pfm example 220 keeps single blank line as paragraph separator', () => {
    const input = load_fixture('220');
    const { tokens, arena, root } = parse_markdown_svelte(input);

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

    expect_paragraph_nodes(tokens, arena, root);
  });

  test('pfm example 221 treats multiple blank lines as separators', () => {
    const input = load_fixture('221');
    const { tokens, arena, root } = parse_markdown_svelte(input);

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

    expect_paragraph_nodes(tokens, arena, root);
  });

  test('pfm example 222 trims leading spaces inside a paragraph', () => {
    const input = load_fixture('222');
    const { tokens, arena, root } = parse_markdown_svelte(input);

    expect(tokens.size).toBe(4);
    expect(to_array(tokens.kinds_slice())).toEqual([
      token_kind.text,
      token_kind.line_break,
      token_kind.text,
      token_kind.line_break
    ]);
    expect(to_array(tokens.starts_slice())).toEqual([2, 5, 7, 10]);
    expect(to_array(tokens.ends_slice())).toEqual([5, 6, 10, 11]);

    expect_paragraph_nodes(tokens, arena, root);
  });

  test('pfm example 223 collapses indented continuation lines', () => {
    const input = load_fixture('223');
    const { tokens, arena, root } = parse_markdown_svelte(input);

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

    expect_paragraph_nodes(tokens, arena, root);
  });

  test('pfm example 224 tolerates up to three leading spaces', () => {
    const input = load_fixture('224');
    const { tokens, arena, root } = parse_markdown_svelte(input);

    expect(tokens.size).toBe(4);
    expect(to_array(tokens.kinds_slice())).toEqual([
      token_kind.text,
      token_kind.line_break,
      token_kind.text,
      token_kind.line_break
    ]);
    expect(to_array(tokens.starts_slice())).toEqual([3, 6, 7, 10]);
    expect(to_array(tokens.ends_slice())).toEqual([6, 7, 10, 11]);

    expect_paragraph_nodes(tokens, arena, root);
  });

  test('pfm example 225 does not turn four-space indents into code fences', () => {
    const input = load_fixture('225');
    const { tokens, arena, root } = parse_markdown_svelte(input);

    expect(tokens.size).toBe(4);
    expect(to_array(tokens.kinds_slice())).toEqual([
      token_kind.text,
      token_kind.line_break,
      token_kind.text,
      token_kind.line_break
    ]);
    expect(to_array(tokens.starts_slice())).toEqual([4, 7, 8, 11]);
    expect(to_array(tokens.ends_slice())).toEqual([7, 8, 11, 12]);

    expect_paragraph_nodes(tokens, arena, root);
  });
});
