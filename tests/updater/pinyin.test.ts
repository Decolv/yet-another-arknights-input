import { expect, it } from 'vitest';
import {
  buildSearchVariants,
  loadPinyinOverrides,
  validatePinyinOverrides,
  type PinyinOverrides,
} from '../../scripts/lib/pinyin.js';

it('builds tone-less pinyin and initials for ordinary Chinese names', () => {
  expect(buildSearchVariants('铃兰')).toEqual({
    primaryPinyin: 'linglan',
    alternatePinyin: [],
    primaryInitials: 'll',
    alternateInitials: [],
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
  });
});

it('normalizes Latin characters, digits, dots, and hyphens in generated keys', () => {
  expect(buildSearchVariants(' A-1.Ｂ ')).toEqual({
    primaryPinyin: 'a1b',
    alternatePinyin: [],
    primaryInitials: 'a1b',
    alternateInitials: [],
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

  expect(validatePinyinOverrides(overrides, [{ id: 'prts:147', name: '铃兰', aliases: ['铃兰妈'] }]))
    .toEqual(['pinyin override alias 兰铃 does not exist for target prts:147']);
});
