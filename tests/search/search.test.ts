import { expect, it } from 'vitest';
import snapshotJson from '../../data/operators.generated.json';
import type { AliasRecord, OperatorRecord, SearchVariants } from '../../src/data/types.js';
import type { OperatorSnapshot } from '../../src/data/types.js';
import { findExactOperator, searchOperators } from '../../src/search/search.js';
import { operators } from '../fixtures/operators.js';

function rankingOperator(
  id: `prts:${number}`,
  name: string,
  nameSearch: Partial<SearchVariants> = {},
  aliases: AliasRecord[] = [],
): OperatorRecord {
  return {
    id,
    name,
    avatarUrl: `https://example.test/${id}.png`,
    nameSearch: {
      primaryPinyin: 'other',
      alternatePinyin: [],
      primaryInitials: 'ot',
      alternateInitials: [],
      ...nameSearch,
    },
    aliases,
  };
}

const priorityOperators: OperatorRecord[] = [
  rankingOperator('prts:101', 'tier'),
  rankingOperator('prts:102', '官方主拼音', { primaryPinyin: 'tier' }),
  rankingOperator('prts:103', '官方备拼音', { alternatePinyin: ['tier'] }),
  rankingOperator('prts:104', '官方主首字母', { primaryInitials: 'tier' }),
  rankingOperator('prts:105', '官方备首字母', { alternateInitials: ['tier'] }),
  rankingOperator('prts:106', '别名中文', {}, [{ text: 'tier', primaryPinyin: 'other', alternatePinyin: [], primaryInitials: 'ot', alternateInitials: [] }]),
  rankingOperator('prts:107', '别名主拼音', {}, [{ text: '别名', primaryPinyin: 'tier', alternatePinyin: [], primaryInitials: 'ot', alternateInitials: [] }]),
  rankingOperator('prts:108', '别名备拼音', {}, [{ text: '别名', primaryPinyin: 'other', alternatePinyin: ['tier'], primaryInitials: 'ot', alternateInitials: [] }]),
  rankingOperator('prts:109', '别名主首字母', {}, [{ text: '别名', primaryPinyin: 'other', alternatePinyin: [], primaryInitials: 'tier', alternateInitials: [] }]),
  rankingOperator('prts:110', '别名备首字母', {}, [{ text: '别名', primaryPinyin: 'other', alternatePinyin: [], primaryInitials: 'ot', alternateInitials: ['tier'] }]),
];

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

it.each([
  ['qiubai', 'name-pinyin'],
  ['qb', 'name-initials'],
] as const)('matches 仇白 through its official-name %s field', (query, matchedBy) => {
  const snapshot = snapshotJson as OperatorSnapshot;
  const result = searchOperators(snapshot.operators, query, 100)
    .find(({ operator }) => operator.id === 'prts:270');

  expect(result).toMatchObject({ matchedBy, matchedText: '仇白' });
});

it.each(['choubai', 'cb'])('does not treat %s as an alternate reading of 仇白', (query) => {
  const snapshot = snapshotJson as OperatorSnapshot;

  expect(searchOperators(snapshot.operators, query, 100)
    .some(({ operator }) => operator.id === 'prts:270')).toBe(false);
});

it('ranks official initials before alias initials', () => {
  const names = searchOperators(operators, 'll', 10).map(({ operator }) => operator.name);
  expect(names.indexOf('铃兰')).toBeLessThan(names.indexOf('合成干员'));
});

it('ranks exact matches above prefixes and prefixes above substrings', () => {
  const candidates = [
    rankingOperator('prts:201', '包含', { primaryPinyin: 'xtierx' }),
    rankingOperator('prts:202', '前缀', { primaryPinyin: 'tierx' }),
    rankingOperator('prts:203', '精确', { primaryPinyin: 'tier' }),
  ];

  expect(searchOperators(candidates, 'tier', 100).map(({ operator }) => operator.name)).toEqual(['精确', '前缀', '包含']);
});

it('uses every adjacent fixed field priority for equally exact matches', () => {
  expect(searchOperators(priorityOperators, 'tier', 100).map(({ operator }) => operator.id)).toEqual([
    'prts:101', 'prts:102', 'prts:103', 'prts:104', 'prts:105',
    'prts:106', 'prts:107', 'prts:108', 'prts:109', 'prts:110',
  ]);
});

it('deduplicates an operator that matches multiple fields and obeys limit', () => {
  const results = searchOperators(operators, 'y', 100);
  expect(new Set(results.map(({ operator }) => operator.id)).size).toBe(results.length);
  expect(results.filter(({ operator }) => operator.id === 'prts:268')).toHaveLength(1);
  expect(searchOperators(operators, 'y', 1)).toHaveLength(1);
});

it('uses numeric stable IDs to break same-quality, same-priority ties', () => {
  expect(searchOperators(operators, 'samequality', 100).map(({ operator }) => operator.id)).toEqual(['prts:9', 'prts:10']);
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

it('accepts readonly operator snapshots', () => {
  const readonlyOperators: readonly OperatorRecord[] = operators;
  expect(searchOperators(readonlyOperators, '铃兰', 10)[0]?.operator.name).toBe('铃兰');
  expect(findExactOperator(readonlyOperators, '铃兰')?.id).toBe('prts:147');
});
