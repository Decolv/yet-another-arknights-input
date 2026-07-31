import { describe, expect, it } from 'vitest';
import { assertOperatorSnapshot, stableIdNumber } from '../../src/data/schema.js';

const valid = {
  schemaVersion: 1,
  generatedAt: '2026-07-31T00:00:00.000Z',
  sources: { prts: 'fixture', moegirl: 'fixture' },
  operators: [{
    id: 'prts:268',
    name: '重岳',
    avatarUrl: 'https://prts.wiki/images/example.png',
    nameSearch: { primaryPinyin: 'chongyue', alternatePinyin: ['zhongyue'], primaryInitials: 'cy', alternateInitials: ['zy'] },
    aliases: [],
  }],
};

describe('assertOperatorSnapshot', () => {
  it('accepts a valid snapshot and parses stable IDs', () => {
    expect(() => assertOperatorSnapshot(valid)).not.toThrow();
    expect(stableIdNumber('prts:268')).toBe(268);
  });
  it('accepts empty alternate pinyin and initials arrays', () => {
    const noAlternateReadings = structuredClone(valid);
    noAlternateReadings.operators[0]!.nameSearch.alternatePinyin = [];
    noAlternateReadings.operators[0]!.nameSearch.alternateInitials = [];
    expect(() => assertOperatorSnapshot(noAlternateReadings)).not.toThrow();
  });
  it('rejects duplicate IDs', () => {
    const duplicate = { ...valid, operators: [valid.operators[0]!, valid.operators[0]!] };
    expect(() => assertOperatorSnapshot(duplicate)).toThrow(/duplicate operator id prts:268/);
  });
  it('rejects malformed stable IDs and empty names', () => {
    const malformed = structuredClone(valid);
    malformed.operators[0]!.id = '268';
    malformed.operators[0]!.name = '';
    expect(() => assertOperatorSnapshot(malformed)).toThrow(/operator id must match prts/);
  });
});
