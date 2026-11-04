import { readFileSync } from 'node:fs';
import { pinyin } from 'pinyin-pro';
import type { SearchVariants } from '../../src/data/types.js';
import { normalizeSearchText } from '../../src/search/normalize.js';

export interface Pronunciation {
  pinyin: string;
  initials: string;
}

export interface PronunciationOverride {
  primary: Pronunciation;
  alternates: Pronunciation[];
}

export interface PinyinOverride {
  name?: PronunciationOverride;
  aliases?: Record<string, PronunciationOverride>;
}

export type PinyinOverrides = Record<`prts:${number}`, PinyinOverride>;
export type PinyinOverrideFile = PinyinOverrides;

export interface PinyinOverrideTarget {
  id: `prts:${number}`;
  name: string;
  aliases: readonly string[];
}

/** 音节数超过 4 就不再生成混合拼写：2^4-2 已经是 14 条，再往上只是噪音。 */
const MAX_HYBRID_SYLLABLES = 4;
const MAX_SYLLABLE_SPLITS = 16;
const HAS_VOWEL = /[aeiouv]/u;
const SYLLABLE_END = /[aeiouvnrg]$/u;

export function buildSearchVariants(text: string, override?: PronunciationOverride): SearchVariants {
  if (override) return variantsFromReadings(override.primary, override.alternates);

  const syllables = pinyin(text, { toneType: 'none', type: 'array' });
  const primaryPinyin = normalizeSearchText(syllables.join(''));
  const primaryInitials = normalizeSearchText(syllables.map((syllable) => syllable[0] ?? '').join(''));
  const erInitials = buildStandaloneErInitials(syllables);
  const alternateInitials = erInitials !== null && erInitials !== primaryInitials ? [erInitials] : [];

  return {
    primaryPinyin,
    alternatePinyin: [],
    primaryInitials,
    alternateInitials,
    hybridPinyin: buildHybridPinyin([syllables], [primaryPinyin, primaryInitials, ...alternateInitials]),
  };
}

export function loadPinyinOverrides(path: string | URL): PinyinOverrides {
  return JSON.parse(readFileSync(path, 'utf8')) as PinyinOverrides;
}

export function validatePinyinOverrides(
  overrides: PinyinOverrides,
  targets: readonly PinyinOverrideTarget[],
): string[] {
  const targetsById = new Map(targets.map((target) => [target.id, target]));
  const errors: string[] = [];

  for (const [id, override] of Object.entries(overrides) as Array<[`prts:${number}`, PinyinOverride]>) {
    const target = targetsById.get(id);
    if (!target) {
      errors.push(`pinyin override target ${id} does not exist`);
      continue;
    }
    for (const alias of Object.keys(override.aliases ?? {})) {
      if (!target.aliases.includes(alias)) errors.push(`pinyin override alias ${alias} does not exist for target ${id}`);
    }
  }

  return errors;
}

function variantsFromReadings(primary: Pronunciation, alternates: readonly Pronunciation[]): SearchVariants {
  const primaryPinyin = normalizeSearchText(primary.pinyin);
  const alternatePinyin = alternates.map((reading) => normalizeSearchText(reading.pinyin));
  const primaryInitials = normalizeSearchText(primary.initials);
  const alternateInitials = alternates.map((reading) => normalizeSearchText(reading.initials));
  const spellings = [primary, ...alternates].flatMap((reading) => splitSyllables(reading.pinyin, reading.initials));

  return {
    primaryPinyin,
    alternatePinyin,
    primaryInitials,
    alternateInitials,
    hybridPinyin: buildHybridPinyin(
      spellings,
      [primaryPinyin, ...alternatePinyin, primaryInitials, ...alternateInitials],
    ),
  };
}

function buildStandaloneErInitials(syllables: readonly string[]): string | null {
  if (!syllables.includes('er')) return null;
  return normalizeSearchText(syllables.map((syllable) => syllable === 'er' ? 'r' : syllable[0] ?? '').join(''));
}

/**
 * 混合拼写：每个音节要么整拼、要么只取首字母。
 * 真言 -> zheny（zhen 整拼 + y）、zyan（z + yan 整拼）。
 * mask 的 0 和全 1 分别是「首字母」和「全拼」，这两条已经有独立字段，跳过。
 */
function buildHybridPinyin(
  spellings: readonly (readonly string[])[],
  exclude: readonly string[],
): string[] {
  const blocked = new Set(exclude);
  const seen = new Set<string>();
  const hybrids: string[] = [];

  for (const syllables of spellings) {
    const count = syllables.length;
    if (count < 2 || count > MAX_HYBRID_SYLLABLES) continue;
    const allFull = 2 ** count - 1;
    for (let mask = 1; mask < allFull; mask += 1) {
      let value = '';
      for (let index = 0; index < count; index += 1) {
        const syllable = syllables[index] ?? '';
        value += (mask >>> index) & 1 ? syllable : (syllable[0] ?? '');
      }
      const normalized = normalizeSearchText(value);
      if (normalized.length === 0 || blocked.has(normalized) || seen.has(normalized)) continue;
      seen.add(normalized);
      hybrids.push(normalized);
    }
  }

  return hybrids;
}

/**
 * 拼音覆盖表只给了整串拼音和首字母，这里按「每个音节的首字母必须等于对应首字母」反推音节边界。
 * 切分方式可能不止一种，全部返回，由 buildHybridPinyin 取并集。
 */
function splitSyllables(reading: string, initials: string): string[][] {
  const letters = normalizeSearchText(reading);
  const marks = normalizeSearchText(initials);
  if (marks.length < 2 || marks.length > MAX_HYBRID_SYLLABLES) return [];
  if (letters.length <= marks.length || letters[0] !== marks[0]) return [];

  const splits: string[][] = [];
  const walk = (start: number, markIndex: number, syllables: readonly string[]): void => {
    if (splits.length >= MAX_SYLLABLE_SPLITS) return;
    if (markIndex === marks.length - 1) {
      const tail = letters.slice(start);
      if (isPlausibleSyllable(tail)) splits.push([...syllables, tail]);
      return;
    }
    const nextMark = marks[markIndex + 1] ?? '';
    for (let end = start + 1; end < letters.length; end += 1) {
      if (letters[end] !== nextMark) continue;
      const syllable = letters.slice(start, end);
      if (!isPlausibleSyllable(syllable)) continue;
      walk(end, markIndex + 1, [...syllables, syllable]);
    }
  };
  walk(0, 0, []);

  return splits;
}

/** 拼音音节一定含元音，且以元音或 n/r/g 收尾，用这条剪掉 "t"、"zh" 这类伪音节。 */
function isPlausibleSyllable(syllable: string): boolean {
  return HAS_VOWEL.test(syllable) && SYLLABLE_END.test(syllable);
}
