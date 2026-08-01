import { expect, it } from 'vitest';
import { normalizeSearchText } from '../../src/search/normalize.js';

it.each([
  [' Ｌｉｎｇ Lan ', 'linglan'],
  ['Lancet-2', 'lancet2'],
  ['Miss.Christine', 'misschristine'],
  ['维娜·维多利亚', '维娜维多利亚'],
  ['U/Official', 'uofficial'],
  ['Back\\Slash', 'backslash'],
  ['Shíěrtèěr / sětě', 'shierteersete'],
])('normalizes %s', (input, expected) => {
  expect(normalizeSearchText(input)).toBe(expected);
});
