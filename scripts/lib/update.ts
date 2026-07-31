import { open, readFile, rename, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { assertOperatorSnapshot, stableIdNumber } from '../../src/data/schema.js';
import type { OperatorRecord, OperatorSnapshot } from '../../src/data/types.js';
import { normalizeSearchText } from '../../src/search/normalize.js';
import type { MoegirlAliasResult } from './moegirl.js';
import {
  buildSearchVariants,
  validatePinyinOverrides,
  type PinyinOverrideFile,
} from './pinyin.js';
import type { PrtsOperator } from './prts.js';

const PRTS_SOURCE_URL = 'https://prts.wiki/w/干员一览/干员id';
const MOEGIRL_SOURCE_URL = 'https://mzh.moegirl.org.cn/';

export interface UpdateDiff {
  added: Array<{ id: string; name: string }>;
  removed: Array<{ id: string; name: string }>;
  renamed: Array<{ id: string; before: string; after: string }>;
  aliasesAdded: Array<{ id: string; alias: string }>;
  aliasesRemoved: Array<{ id: string; alias: string }>;
  aliasCollisions: Array<{ alias: string; ids: string[] }>;
}

export interface UpdateReport {
  snapshot: OperatorSnapshot;
  diff: UpdateDiff;
  warnings: string[];
  written: boolean;
}

export interface BuildSnapshotInput {
  roster: PrtsOperator[];
  avatarUrls: Map<PrtsOperator['id'], string>;
  aliasesByName: Map<string, string[]>;
  aliasWarnings: string[];
  overrides: PinyinOverrideFile;
  generatedAt: string;
  minOperators: number;
}

export interface UpdateSources {
  fetchRoster(now: Date): Promise<PrtsOperator[]>;
  fetchAvatarUrls(roster: readonly PrtsOperator[]): Promise<Map<PrtsOperator['id'], string>>;
  fetchAliases(names: readonly string[]): Promise<MoegirlAliasResult>;
}

export interface RunUpdateOptions {
  targetPath: string;
  now: Date;
  acceptedRemovals: ReadonlySet<string>;
  overrides: PinyinOverrideFile;
  sources: UpdateSources;
  dryRun?: boolean;
  minOperators?: number;
}

export function buildSnapshot(input: BuildSnapshotInput): OperatorSnapshot {
  const sortedRoster = [...input.roster].sort((left, right) => left.sortId - right.sortId);
  const overrideTargets = sortedRoster.map((operator) => ({
    id: operator.id,
    name: operator.name,
    aliases: input.aliasesByName.get(operator.name) ?? [],
  }));
  const overrideErrors = validatePinyinOverrides(input.overrides, overrideTargets);
  if (overrideErrors.length > 0) throw new Error(overrideErrors.join('\n'));

  const operators: OperatorRecord[] = sortedRoster.map((operator) => {
    const avatarUrl = input.avatarUrls.get(operator.id);
    if (!isHttpsUrl(avatarUrl)) {
      throw new Error(`missing HTTPS avatar for ${operator.id} ${operator.name}`);
    }
    const operatorOverride = input.overrides[operator.id];
    const aliasTexts = [...(input.aliasesByName.get(operator.name) ?? [])].sort(compareNormalizedText);
    return {
      id: operator.id,
      name: operator.name,
      avatarUrl,
      nameSearch: buildSearchVariants(operator.name, operatorOverride?.name),
      aliases: aliasTexts.map((text) => ({
        text,
        ...buildSearchVariants(text, operatorOverride?.aliases?.[text]),
      })),
    };
  });

  const snapshot: OperatorSnapshot = {
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    sources: {
      prts: PRTS_SOURCE_URL,
      moegirl: MOEGIRL_SOURCE_URL,
    },
    operators,
  };
  assertOperatorSnapshot(snapshot, { minOperators: input.minOperators });
  return snapshot;
}

export function diffSnapshots(previous: OperatorSnapshot, next: OperatorSnapshot): UpdateDiff {
  const previousById = new Map(previous.operators.map((operator) => [operator.id, operator]));
  const nextById = new Map(next.operators.map((operator) => [operator.id, operator]));
  const added = next.operators
    .filter((operator) => !previousById.has(operator.id))
    .map(({ id, name }) => ({ id, name }));
  const removed = previous.operators
    .filter((operator) => !nextById.has(operator.id))
    .map(({ id, name }) => ({ id, name }));
  const renamed: UpdateDiff['renamed'] = [];
  const aliasesAdded: UpdateDiff['aliasesAdded'] = [];
  const aliasesRemoved: UpdateDiff['aliasesRemoved'] = [];

  for (const operator of next.operators) {
    const before = previousById.get(operator.id);
    if (before && before.name !== operator.name) {
      renamed.push({ id: operator.id, before: before.name, after: operator.name });
    }
    const previousAliases = new Set(before?.aliases.map(({ text }) => text) ?? []);
    for (const { text } of operator.aliases) {
      if (!previousAliases.has(text)) aliasesAdded.push({ id: operator.id, alias: text });
    }
  }
  for (const operator of previous.operators) {
    const nextAliases = new Set(nextById.get(operator.id)?.aliases.map(({ text }) => text) ?? []);
    for (const { text } of operator.aliases) {
      if (!nextAliases.has(text)) aliasesRemoved.push({ id: operator.id, alias: text });
    }
  }

  const idsByAlias = new Map<string, string[]>();
  for (const operator of next.operators) {
    for (const { text } of operator.aliases) {
      const ids = idsByAlias.get(text) ?? [];
      if (!ids.includes(operator.id)) ids.push(operator.id);
      idsByAlias.set(text, ids);
    }
  }
  const aliasCollisions = [...idsByAlias]
    .filter(([, ids]) => ids.length > 1)
    .sort(([left], [right]) => compareNormalizedText(left, right))
    .map(([alias, ids]) => ({ alias, ids: ids.sort(compareIds) }));

  return {
    added: added.sort(compareIdRecords),
    removed: removed.sort(compareIdRecords),
    renamed: renamed.sort(compareIdRecords),
    aliasesAdded: aliasesAdded.sort(compareAliasChanges),
    aliasesRemoved: aliasesRemoved.sort(compareAliasChanges),
    aliasCollisions,
  };
}

export function assertSafeUpdate(
  previous: OperatorSnapshot,
  next: OperatorSnapshot,
  acceptedRemovals: ReadonlySet<string>,
): void {
  const nextIds = new Set(next.operators.map(({ id }) => id));
  const unaccepted = previous.operators
    .filter(({ id }) => !nextIds.has(id) && !acceptedRemovals.has(id))
    .map(({ id }) => id);
  if (unaccepted.length > 0) {
    throw new Error(`unaccepted removals: ${unaccepted.join(', ')}`);
  }
  if (previous.operators.length > 0 && next.operators.length / previous.operators.length < 0.9) {
    throw new Error(
      `next operator count ${next.operators.length} is below 90 percent of previous count ${previous.operators.length}`,
    );
  }
}

export async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  const temporaryPath = join(dirname(path), `.${basename(path)}.${process.pid}.tmp`);
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(temporaryPath, 'w');
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporaryPath, path);
  } catch (error) {
    if (handle) await handle.close().catch(() => undefined);
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function runUpdate(options: RunUpdateOptions): Promise<UpdateReport> {
  const roster = await options.sources.fetchRoster(options.now);
  const avatarUrls = await options.sources.fetchAvatarUrls(roster);
  const aliasResult = await options.sources.fetchAliases(roster.map(({ name }) => name));
  const snapshot = buildSnapshot({
    roster,
    avatarUrls,
    aliasesByName: aliasResult.aliasesByName,
    aliasWarnings: aliasResult.warnings,
    overrides: options.overrides,
    generatedAt: options.now.toISOString(),
    minOperators: options.minOperators ?? 100,
  });
  const previous = await readPreviousSnapshot(options.targetPath, snapshot);
  const diff = diffSnapshots(previous, snapshot);
  assertSafeUpdate(previous, snapshot, options.acceptedRemovals);
  const warnings = [
    ...aliasResult.warnings,
    ...diff.aliasCollisions.map(
      ({ alias, ids }) => `alias ${alias} belongs to multiple operators: ${ids.join(', ')}`,
    ),
  ];
  if (!options.dryRun) await writeJsonAtomic(options.targetPath, snapshot);
  return { snapshot, diff, warnings, written: !options.dryRun };
}

function isHttpsUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function compareNormalizedText(left: string, right: string): number {
  return normalizeSearchText(left).localeCompare(normalizeSearchText(right))
    || left.localeCompare(right);
}

function compareIds(left: string, right: string): number {
  return stableIdNumber(left) - stableIdNumber(right);
}

function compareIdRecords(left: { id: string }, right: { id: string }): number {
  return compareIds(left.id, right.id);
}

function compareAliasChanges(
  left: { id: string; alias: string },
  right: { id: string; alias: string },
): number {
  return compareIds(left.id, right.id) || compareNormalizedText(left.alias, right.alias);
}

async function readPreviousSnapshot(path: string, next: OperatorSnapshot): Promise<OperatorSnapshot> {
  try {
    const previous: unknown = JSON.parse(await readFile(path, 'utf8'));
    assertOperatorSnapshot(previous);
    return previous;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return {
      schemaVersion: 1,
      generatedAt: next.generatedAt,
      sources: next.sources,
      operators: [],
    };
  }
}
