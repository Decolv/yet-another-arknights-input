import { expect, it } from 'vitest';
import { findExactOperator, searchOperators } from '../../src/search/search.js';
import { operators } from '../fixtures/operators.js';

it.each(['铃兰', '铃', 'linglan', 'ling', 'll'])('ranks 铃兰 first for %s', (query) => {
  expect(searchOperators(operators, query, 10)[0]?.operator.name).toBe('铃兰');
});

it.each(['铃兰妈', 'linglanma', 'llm'])('returns 忍冬 through an alias for %s', (query) => {
  const result = searchOperators(operators, query, 10)[0];
  expect(result?.operator.name).toBe('忍冬');
  expect(result?.matchedBy).toMatch(/^alias/);
  expect(result?.matchedText).toBe('铃兰妈');
});

it.each(['chongyue', 'zhongyue', 'cy', 'zy'])('ranks 重岳 first for %s', (query) => {
  expect(searchOperators(operators, query, 10)[0]?.operator.name).toBe('重岳');
});

it('ranks official initials before alias initials', () => {
  const names = searchOperators(operators, 'll', 10).map(({ operator }) => operator.name);
  expect(names.indexOf('铃兰')).toBeLessThan(names.indexOf('合成干员'));
});

it('deduplicates an operator that matches multiple fields and obeys limit', () => {
  const results = searchOperators(operators, 'ling', 1);
  expect(results).toHaveLength(1);
  expect(results[0]?.operator.name).toBe('铃兰');
});

it('rejects blank queries and invalid limits', () => {
  expect(searchOperators(operators, '---', 10)).toEqual([]);
  expect(searchOperators(operators, '铃兰', 0)).toEqual([]);
  expect(searchOperators(operators, '铃兰', 1.5)).toEqual([]);
});

it('finds only exact official display names', () => {
  expect(findExactOperator(operators, '铃兰')?.id).toBe('prts:147');
  expect(findExactOperator(operators, 'll')).toBeNull();
  expect(findExactOperator(operators, '铃兰妈')).toBeNull();
});
