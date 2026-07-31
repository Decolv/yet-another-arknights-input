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

export function buildSearchVariants(text: string, override?: PronunciationOverride): SearchVariants {
  if (override) return variantsFromReadings(override.primary, override.alternates);

  return {
    primaryPinyin: normalizeSearchText(pinyin(text, { toneType: 'none', type: 'array' }).join('')),
    alternatePinyin: [],
    primaryInitials: normalizeSearchText(pinyin(text, { pattern: 'first', type: 'array' }).join('')),
    alternateInitials: [],
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
  return {
    primaryPinyin: normalizeSearchText(primary.pinyin),
    alternatePinyin: alternates.map((reading) => normalizeSearchText(reading.pinyin)),
    primaryInitials: normalizeSearchText(primary.initials),
    alternateInitials: alternates.map((reading) => normalizeSearchText(reading.initials)),
  };
}
