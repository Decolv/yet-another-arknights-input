import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import type { PrtsOperator } from '../../scripts/lib/prts.js';
import {
  assertSafeUpdate,
  buildSnapshot,
  diffSnapshots,
  runUpdate,
  writeJsonAtomic,
} from '../../scripts/lib/update.js';
import type { OperatorSnapshot } from '../../src/data/types.js';
import { makeSnapshot } from '../fixtures/operators.js';

const generatedAt = '2026-07-31T00:00:00.000Z';

function roster(...rows: Array<[number, string]>): PrtsOperator[] {
  return rows.map(([sortId, name]) => ({
    id: `prts:${sortId}` as const,
    sortId,
    name,
    releasedAt: generatedAt,
  }));
}

it('merges aliases and pinyin into stable-ID ordered operators', () => {
  const rows = roster([268, '重岳'], [147, '铃兰']);
  const result = buildSnapshot({
    roster: rows,
    avatarUrls: new Map([
      ['prts:268', 'https://example.test/268.png'],
      ['prts:147', 'https://example.test/147.png'],
    ]),
    aliasesByName: new Map([['重岳', ['重岳哥', '大哥']]]),
    aliasWarnings: [],
    overrides: {
      'prts:268': {
        name: {
          primary: { pinyin: 'chongyue', initials: 'cy' },
          alternates: [{ pinyin: 'zhongyue', initials: 'zy' }],
        },
      },
    },
    generatedAt,
    minOperators: 2,
  });

  expect(result.operators.map(({ id }) => id)).toEqual(['prts:147', 'prts:268']);
  expect(result.sources).toEqual({
    prts: 'https://prts.wiki/w/干员一览/干员id',
    moegirl: 'https://mzh.moegirl.org.cn/',
  });
  expect(result.operators[1]?.nameSearch).toEqual({
    primaryPinyin: 'chongyue',
    alternatePinyin: ['zhongyue'],
    primaryInitials: 'cy',
    alternateInitials: ['zy'],
  });
  expect(result.operators[1]?.aliases.map(({ text }) => text)).toEqual(['大哥', '重岳哥']);
});

it('keeps duplicate aliases across operators as legal one-to-many data', () => {
  const rows = roster([2, '乙'], [1, '甲']);
  const snapshot = buildSnapshot({
    roster: rows,
    avatarUrls: new Map([
      ['prts:1', 'https://example.test/1.png'],
      ['prts:2', 'https://example.test/2.png'],
    ]),
    aliasesByName: new Map([['甲', ['同名']], ['乙', ['同名']]]),
    aliasWarnings: [],
    overrides: {},
    generatedAt,
    minOperators: 2,
  });

  expect(snapshot.operators.map((operator) => operator.aliases[0]?.text)).toEqual(['同名', '同名']);
  expect(diffSnapshots(makeSnapshot(0), snapshot).aliasCollisions).toEqual([
    { alias: '同名', ids: ['prts:1', 'prts:2'] },
  ]);
});

it('preserves Moegirl warnings and rejects missing avatars', async () => {
  const rows = roster([1, '甲']);
  const target = join(await mkdtemp(join(tmpdir(), 'akni-update-')), 'operators.generated.json');
  await expect(runUpdate({
    targetPath: target,
    now: new Date(generatedAt),
    acceptedRemovals: new Set(),
    overrides: {},
    minOperators: 1,
    sources: {
      fetchRoster: async () => rows,
      fetchAvatarUrls: async () => new Map(),
      fetchAliases: async () => ({
        aliasesByName: new Map(),
        warnings: ['Moegirl page 甲 is missing'],
      }),
    },
  })).rejects.toThrow(/missing HTTPS avatar.*prts:1/);
});

it('rejects duplicate IDs, duplicate official names, and fewer than 100 live operators', () => {
  const input = {
    avatarUrls: new Map([
      ['prts:1' as const, 'https://example.test/1.png'],
      ['prts:2' as const, 'https://example.test/2.png'],
    ]),
    aliasesByName: new Map<string, string[]>(),
    aliasWarnings: [],
    overrides: {},
    generatedAt,
    minOperators: 100,
  };

  expect(() => buildSnapshot({ ...input, roster: roster([1, '甲'], [1, '乙']) })).toThrow(/duplicate operator id/);
  expect(() => buildSnapshot({ ...input, roster: roster([1, '甲'], [2, '甲']) })).toThrow(/duplicate operator name/);
  expect(() => buildSnapshot({ ...input, roster: roster([1, '甲'], [2, '乙']) })).toThrow(/at least 100/);
});

it('rejects removals unless every removed ID is explicitly accepted', () => {
  const previous = makeSnapshot(120);
  const next = { ...previous, operators: previous.operators.slice(0, 119) };

  expect(() => assertSafeUpdate(previous, next, new Set())).toThrow(/unaccepted removals.*prts:120/);
  expect(() => assertSafeUpdate(previous, next, new Set(['prts:120']))).not.toThrow();
});

it('rejects a next snapshot smaller than 90 percent of the previous snapshot', () => {
  const previous = makeSnapshot(120);
  const next = { ...previous, operators: previous.operators.slice(0, 100) };
  const accepted = new Set(previous.operators.slice(100).map(({ id }) => id));

  expect(() => assertSafeUpdate(previous, next, accepted)).toThrow(/below 90 percent/);
});

it('reports every stable-ID diff section and legal alias collisions', () => {
  const previous = makeSnapshot(2);
  previous.operators[0]!.aliases = [{
    text: '旧别号',
    primaryPinyin: 'jiubiehao',
    alternatePinyin: [],
    primaryInitials: 'jbh',
    alternateInitials: [],
  }];
  const next = makeSnapshot(2);
  next.operators.shift();
  next.operators[0]!.name = '改名';
  next.operators[0]!.aliases = [{
    text: '同名',
    primaryPinyin: 'tongming',
    alternatePinyin: [],
    primaryInitials: 'tm',
    alternateInitials: [],
  }];
  const added = makeSnapshot(3).operators[2]!;
  added.aliases = structuredClone(next.operators[0]!.aliases);
  next.operators.push(added);

  expect(diffSnapshots(previous, next)).toEqual({
    added: [{ id: 'prts:3', name: '干员3' }],
    removed: [{ id: 'prts:1', name: '干员1' }],
    renamed: [{ id: 'prts:2', before: '干员2', after: '改名' }],
    aliasesAdded: [{ id: 'prts:2', alias: '同名' }, { id: 'prts:3', alias: '同名' }],
    aliasesRemoved: [{ id: 'prts:1', alias: '旧别号' }],
    aliasCollisions: [{ alias: '同名', ids: ['prts:2', 'prts:3'] }],
  });
});

it('leaves the previous file byte-for-byte unchanged when validation fails', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'akni-update-'));
  const target = join(directory, 'operators.generated.json');
  const priorBytes = '{"old":true}\r\n';
  await writeFile(target, priorBytes);

  await expect(runUpdate({
    targetPath: target,
    now: new Date(generatedAt),
    acceptedRemovals: new Set(),
    overrides: {},
    minOperators: 1,
    sources: {
      fetchRoster: async () => roster([1, '甲']),
      fetchAvatarUrls: async () => new Map(),
      fetchAliases: async () => ({ aliasesByName: new Map(), warnings: [] }),
    },
  })).rejects.toThrow();

  expect(await readFile(target, 'utf8')).toBe(priorBytes);
});

it('renames a fully written temporary file over the target only after validation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'akni-update-'));
  const target = join(directory, 'operators.generated.json');
  await writeFile(target, '{"old":true}\n');

  await writeJsonAtomic(target, makeSnapshot(2));

  const bytes = await readFile(target, 'utf8');
  expect(bytes.endsWith('\n')).toBe(true);
  expect(JSON.parse(bytes).operators).toHaveLength(2);
  expect(await readdir(directory)).toEqual(['operators.generated.json']);
});

it('returns source and collision warnings without writing in dry-run mode', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'akni-update-'));
  const target = join(directory, 'operators.generated.json');
  const previous: OperatorSnapshot = makeSnapshot(2);
  await writeFile(target, `${JSON.stringify(previous)}\n`);

  const report = await runUpdate({
    targetPath: target,
    now: new Date(generatedAt),
    acceptedRemovals: new Set(),
    overrides: {},
    dryRun: true,
    minOperators: 2,
    sources: {
      fetchRoster: async () => roster([1, '甲'], [2, '乙']),
      fetchAvatarUrls: async () => new Map([
        ['prts:1', 'https://example.test/1.png'],
        ['prts:2', 'https://example.test/2.png'],
      ]),
      fetchAliases: async () => ({
        aliasesByName: new Map([['甲', ['同名']], ['乙', ['同名']]]),
        warnings: ['Moegirl page 丙 is missing'],
      }),
    },
  });

  expect(report.written).toBe(false);
  expect(report.warnings).toEqual([
    'Moegirl page 丙 is missing',
    'alias 同名 belongs to multiple operators: prts:1, prts:2',
  ]);
  expect(JSON.parse(await readFile(target, 'utf8')).operators[0].name).toBe('干员1');
});
