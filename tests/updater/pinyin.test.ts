import { expect, it } from 'vitest';
import {
  buildSearchVariants,
  loadPinyinOverrides,
  validatePinyinOverrides,
  type PinyinOverrides,
} from '../../scripts/lib/pinyin.js';

const shiertelHybrids = [
    'shiete', 'serte', 'shierte', 'setee', 'shietee', 'sertee', 'shiertee',
    'seter', 'shieter', 'serter', 'shierter', 'seteer', 'shieteer', 'serteer',
  ];

it('builds tone-less pinyin and initials for ordinary Chinese names', () => {
  expect(buildSearchVariants('铃兰')).toEqual({
    primaryPinyin: 'linglan',
    alternatePinyin: [],
    primaryInitials: 'll',
    alternateInitials: [],
    hybridPinyin: ['lingl', 'llan'],
  });
});

it('builds hybrid spellings that mix whole syllables with bare initials', () => {
  expect(buildSearchVariants('真言')).toMatchObject({
    primaryPinyin: 'zhenyan',
    primaryInitials: 'zy',
    hybridPinyin: ['zheny', 'zyan'],
  });
});

it('adds a standalone er initial variant without tone marks', () => {
  expect(buildSearchVariants('史尔特尔')).toEqual({
    primaryPinyin: 'shierteer',
    alternatePinyin: [],
    primaryInitials: 'sete',
    alternateInitials: ['srtr'],
    hybridPinyin: shiertelHybrids,
  });
});

it('skips hybrid spellings once a name has more than four syllables', () => {
  expect(buildSearchVariants('缄默德克萨斯').hybridPinyin).toEqual([]);
  expect(buildSearchVariants('煌').hybridPinyin).toEqual([]);
});

it('strips tone marks from curated readings', () => {
  expect(buildSearchVariants('占位', {
    primary: { pinyin: 'shíěrtèěr', initials: 'sětě' },
    alternates: [{ pinyin: 'shíěrtèěr', initials: 'sětě' }],
  })).toEqual({
    primaryPinyin: 'shierteer',
    alternatePinyin: ['shierteer'],
    primaryInitials: 'sete',
    alternateInitials: ['sete'],
    hybridPinyin: shiertelHybrids,
  });
});

it('preserves the curated 重岳 primary and alternate readings', () => {
  const overrides = loadPinyinOverrides(new URL('../../data/pinyin-overrides.json', import.meta.url));
  const override = overrides['prts:268']?.name;

  expect(buildSearchVariants('重岳', override)).toEqual({
    primaryPinyin: 'chongyue',
    alternatePinyin: ['zhongyue'],
    primaryInitials: 'cy',
    alternateInitials: ['zy'],
    hybridPinyin: ['chongy', 'cyue', 'zhongy', 'zyue'],
  });
});

it('preserves 仇白 official-name reading without treating the generic 仇 reading as an alternate', () => {
  const overrides = loadPinyinOverrides(new URL('../../data/pinyin-overrides.json', import.meta.url));
  const override = overrides['prts:270']?.name;

  expect(buildSearchVariants('仇白', override)).toEqual({
    primaryPinyin: 'qiubai',
    alternatePinyin: [],
    primaryInitials: 'qb',
    alternateInitials: [],
    hybridPinyin: ['qiub', 'qbai'],
  });
});

it('normalizes Latin characters, digits, dots, and hyphens in generated keys', () => {
  expect(buildSearchVariants(' A-1.Ｂ ')).toEqual({
    primaryPinyin: 'a1b',
    alternatePinyin: [],
    primaryInitials: 'a1b',
    alternateInitials: [],
    hybridPinyin: [],
  });
});

it('reports a stable-ID override that no longer belongs to a target', () => {
  const overrides: PinyinOverrides = {
    'prts:999': { name: { primary: { pinyin: 'jiu', initials: 'j' }, alternates: [] }, aliases: {} },
  };

  expect(validatePinyinOverrides(overrides, [{ id: 'prts:147', name: '铃兰', aliases: [] }]))
    .toEqual(['pinyin override target prts:999 does not exist']);
});

it('reports an alias override that does not match the target aliases', () => {
  const overrides: PinyinOverrides = {
    'prts:147': {
      aliases: { '兰铃': { primary: { pinyin: 'lanling', initials: 'll' }, alternates: [] } },
    },
  };

  expect(validatePinyinOverrides(overrides, [{ id: 'prts:147', name: '铃兰', aliases: ['不存在'] }]))
    .toEqual(['pinyin override alias 兰铃 does not exist for target prts:147']);
});
