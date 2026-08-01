# Arknights Name Input Web Component Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dependency-free browser Web Component that autocompletes currently released CN Arknights operator names from a build-time PRTS/Moegirl snapshot.

**Architecture:** A Node/TypeScript update pipeline reads PRTS as the authoritative roster, enriches each operator with Moegirl's per-character `别号` field, generates curated pinyin variants, validates the snapshot, and writes committed JSON. An esbuild IIFE bundles that JSON with a pure search core and a Shadow DOM custom element into one browser script; runtime network access is limited to the PRTS avatar URLs of currently rendered candidates.

**Tech Stack:** Node.js 22+, npm, TypeScript, pinyin-pro, csv-parse, Vitest with jsdom, esbuild, Playwright.

## Global Constraints

- Runtime delivery is exactly one `dist/arknights-name-input.js` loaded by a normal `<script src>`.
- Runtime code has no third-party dependency and does not fetch operator or alias data.
- Data scope is PRTS rows with `sortId > 0` and release time not later than the current `Asia/Shanghai` time.
- Public IDs use `prts:<sortId>`, for example `prts:147`, `prts:268`, and `prts:352`.
- Aliases come only from the `别号` field of each Moegirl character page; do not scrape the Arknights meme page.
- Search supports exact, prefix, and substring matches over names, primary/alternate full pinyin, initials, aliases, and alias pinyin.
- Match quality sorts before field priority; official-name initials outrank alias initials at equal match quality.
- Free text remains allowed; `valid` is true only for an exact official display name.
- Suggestions show only avatar and official name; occupation and rarity are out of scope.
- Avatars are not prefetched globally. Each query creates at most `maxResults` displayed avatar loads; the default is 8.
- Avatar failures hide the image without affecting search or selection.
- Shadow DOM isolates styles; the public CSS variable names in the design spec are stable API.
- Support current Chrome, Edge, Firefox, Safari, and common mobile WebViews; do not add IE compatibility.
- Implement each behavior test-first and keep generated data, source adapters, search, and UI independently testable.

## Verified Source Contracts

- PRTS MediaWiki API: `https://prts.wiki/api.php`
- PRTS roster page: `干员一览/干员id`, rendered as CSV with columns `sortId,name,rarity,approach,date`
- PRTS avatar file convention: `File:头像_<正式名>.png`, resolved through `prop=imageinfo&iiprop=url&iiurlwidth=96`
- Moegirl MediaWiki API: `https://mzh.moegirl.org.cn/api.php`
- Moegirl alias contract: page wikitext field `|别号=...`

Build all API URLs with `URL` and `URLSearchParams`; do not concatenate unescaped query strings.

## Planned File Map

### Project and build

- `package.json` — scripts, Node floor, and development dependencies.
- `package-lock.json` — exact tool dependency lock.
- `tsconfig.json` — strict shared TypeScript configuration.
- `vitest.config.ts` — unit/component test discovery.
- `playwright.config.ts` — desktop and mobile browser projects.
- `scripts/build.mjs` — esbuild IIFE production build.
- `scripts/serve-static.ts` — local static server for demo and E2E.

### Data contracts and generated data

- `src/data/types.ts` — shared snapshot, operator, pinyin, event, and search-result types.
- `src/data/schema.ts` — structural and cross-record validation.
- `data/operators.generated.json` — committed build-time snapshot; never hand-edited.
- `data/pinyin-overrides.json` — committed primary/alternate pronunciation corrections.

### Data update pipeline

- `scripts/lib/mediawiki-client.ts` — rate-limited, retrying, conditional-cache JSON client.
- `scripts/lib/prts.ts` — roster CSV and avatar URL adapter.
- `scripts/lib/moegirl.ts` — batched page query and `别号` parser.
- `scripts/lib/pinyin.ts` — pinyin generation and override application.
- `scripts/lib/update.ts` — merge, diff, hard/soft validation, and atomic write.
- `scripts/update-data.ts` — `npm run update-data` CLI.
- `scripts/check-data.ts` — `npm run check-data` CLI.

### Runtime

- `src/search/normalize.ts` — Unicode and separator normalization.
- `src/search/search.ts` — match scoring, deduplication, and deterministic sorting.
- `src/component/styles.ts` — Shadow DOM CSS and public CSS variables.
- `src/component/arknights-name-input.ts` — element state, DOM, interaction, and events.
- `src/index.ts` — guarded custom-element registration and generated-data wiring.

### Tests, fixtures, and usage

- `tests/data/schema.test.ts`
- `tests/search/normalize.test.ts`
- `tests/search/search.test.ts`
- `tests/updater/mediawiki-client.test.ts`
- `tests/updater/prts.test.ts`
- `tests/updater/moegirl.test.ts`
- `tests/updater/pinyin.test.ts`
- `tests/updater/update.test.ts`
- `tests/component/arknights-name-input.test.ts`
- `tests/e2e/component.spec.ts`
- `tests/fixtures/prts-roster-api.json`
- `tests/fixtures/prts-imageinfo-api.json`
- `tests/fixtures/moegirl-revisions-api.json`
- `tests/fixtures/operators.ts`
- `demo/index.html`
- `README.md`

---

### Task 1: Establish the TypeScript project and snapshot contract

**Files:**
- Create: `package.json`
- Create: `package-lock.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `src/data/types.ts`
- Create: `src/data/schema.ts`
- Create: `tests/data/schema.test.ts`

**Interfaces:**
- Produces: `OperatorSnapshot`, `OperatorRecord`, `SearchVariants`, `AliasRecord`, `SelectedCharacter`, `CharacterSelectDetail`, `MatchedBy`.
- Produces: `assertOperatorSnapshot(value, options)` and `stableIdNumber(id)`.

- [ ] **Step 1: Initialize npm and install development tools**

Run each command separately:

```powershell
npm init -y
npm install -D typescript @types/node tsx vitest jsdom esbuild pinyin-pro csv-parse @playwright/test
npm pkg set type=module
npm pkg set engines.node=">=22.0.0"
npm pkg set scripts.typecheck="tsc --noEmit"
npm pkg set scripts.test="vitest run"
npm pkg set scripts.test:watch="vitest"
npm pkg set scripts.build="node scripts/build.mjs"
npm pkg set scripts.update-data="tsx scripts/update-data.ts"
npm pkg set scripts.check-data="tsx scripts/check-data.ts"
npm pkg set scripts.demo="tsx scripts/serve-static.ts"
npm pkg set scripts.test:e2e="playwright test"
npm pkg set scripts.check="npm run typecheck && npm test && npm run build"
```

Expected: `package-lock.json` is created and `package.json` contains all scripts exactly once.

- [ ] **Step 2: Add strict TypeScript and Vitest configuration**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node", "vitest/globals"]
  },
  "include": ["src/**/*.ts", "scripts/**/*.ts", "tests/**/*.ts", "*.config.ts"]
}
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    restoreMocks: true,
  },
});
```

- [ ] **Step 3: Write failing contract tests**

Create `tests/data/schema.test.ts`:

```ts
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
    nameSearch: {
      primaryPinyin: 'chongyue',
      alternatePinyin: ['zhongyue'],
      primaryInitials: 'cy',
      alternateInitials: ['zy'],
    },
    aliases: [],
  }],
};

describe('assertOperatorSnapshot', () => {
  it('accepts a valid snapshot and parses stable IDs', () => {
    expect(() => assertOperatorSnapshot(valid)).not.toThrow();
    expect(stableIdNumber('prts:268')).toBe(268);
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
```

- [ ] **Step 4: Run the contract test and verify failure**

Run:

```powershell
npx vitest run tests/data/schema.test.ts
```

Expected: FAIL because `src/data/schema.ts` does not exist.

- [ ] **Step 5: Implement the shared types and validator**

Create `src/data/types.ts` with these exact public shapes:

```ts
export interface SearchVariants {
  primaryPinyin: string;
  alternatePinyin: string[];
  primaryInitials: string;
  alternateInitials: string[];
}

export interface AliasRecord extends SearchVariants {
  text: string;
}

export interface OperatorRecord {
  id: `prts:${number}`;
  name: string;
  avatarUrl: string;
  nameSearch: SearchVariants;
  aliases: AliasRecord[];
}

export interface OperatorSnapshot {
  schemaVersion: 1;
  generatedAt: string;
  sources: { prts: string; moegirl: string };
  operators: OperatorRecord[];
}

export type MatchedBy =
  | 'name'
  | 'name-pinyin'
  | 'name-pinyin-alt'
  | 'name-initials'
  | 'name-initials-alt'
  | 'alias'
  | 'alias-pinyin'
  | 'alias-pinyin-alt'
  | 'alias-initials'
  | 'alias-initials-alt';

export interface SelectedCharacter {
  id: OperatorRecord['id'];
  name: string;
  avatarUrl: string;
}

export interface CharacterSelectDetail extends SelectedCharacter {
  matchedBy: MatchedBy;
  matchedText: string;
}

export interface SearchResult {
  operator: OperatorRecord;
  matchedBy: MatchedBy;
  matchedText: string;
  quality: 1 | 2 | 3;
  fieldPriority: number;
}
```

Create `src/data/schema.ts`. `assertOperatorSnapshot` must collect issues before throwing, verify `schemaVersion === 1`, valid ISO timestamp, unique IDs and names, non-empty HTTPS avatar URLs, all search strings, and `operators.length >= minOperators`:

```ts
import type { OperatorSnapshot } from './types.js';

function checkVariants(value: unknown, label: string, issues: string[]): void {
  if (!value || typeof value !== 'object') {
    issues.push(`${label} must be an object`);
    return;
  }
  const variants = value as Record<string, unknown>;
  for (const key of ['primaryPinyin', 'primaryInitials'] as const) {
    if (typeof variants[key] !== 'string' || !variants[key]) issues.push(`${label}.${key} must be non-empty`);
  }
  for (const key of ['alternatePinyin', 'alternateInitials'] as const) {
    if (!Array.isArray(variants[key]) || !(variants[key] as unknown[]).every((item) => typeof item === 'string' && item.length > 0)) {
      issues.push(`${label}.${key} must contain non-empty strings`);
    }
  }
}

export function stableIdNumber(id: string): number {
  const match = /^prts:(\d+)$/.exec(id);
  if (!match) throw new Error(`operator id must match prts:<positive integer>: ${id}`);
  const value = Number(match[1]);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`operator id must match prts:<positive integer>: ${id}`);
  }
  return value;
}

export function assertOperatorSnapshot(
  value: unknown,
  { minOperators = 1 }: { minOperators?: number } = {},
): asserts value is OperatorSnapshot {
  const issues: string[] = [];
  if (!value || typeof value !== 'object') throw new Error('snapshot must be an object');
  const snapshot = value as Record<string, unknown>;
  if (snapshot.schemaVersion !== 1) issues.push('schemaVersion must be 1');
  if (typeof snapshot.generatedAt !== 'string' || Number.isNaN(Date.parse(snapshot.generatedAt))) {
    issues.push('generatedAt must be an ISO timestamp');
  }
  if (!Array.isArray(snapshot.operators)) issues.push('operators must be an array');
  if (!snapshot.sources || typeof snapshot.sources !== 'object') {
    issues.push('sources must be an object');
  } else {
    const sources = snapshot.sources as Record<string, unknown>;
    if (typeof sources.prts !== 'string' || !sources.prts) issues.push('sources.prts must be non-empty');
    if (typeof sources.moegirl !== 'string' || !sources.moegirl) issues.push('sources.moegirl must be non-empty');
  }
  const operators = Array.isArray(snapshot.operators) ? snapshot.operators : [];
  if (operators.length < minOperators) issues.push(`operators must contain at least ${minOperators} records`);
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const raw of operators) {
    const operator = raw as Record<string, unknown>;
    try { stableIdNumber(String(operator.id ?? '')); } catch (error) { issues.push((error as Error).message); }
    const id = String(operator.id ?? '');
    const name = String(operator.name ?? '').trim();
    if (ids.has(id)) issues.push(`duplicate operator id ${id}`);
    if (names.has(name)) issues.push(`duplicate operator name ${name}`);
    ids.add(id);
    names.add(name);
    if (!name) issues.push(`operator ${id} has an empty name`);
    if (typeof operator.avatarUrl !== 'string' || !operator.avatarUrl.startsWith('https://')) {
      issues.push(`operator ${id} has an invalid avatarUrl`);
    }
    checkVariants(operator.nameSearch, `operator ${id}.nameSearch`, issues);
    if (!Array.isArray(operator.aliases)) {
      issues.push(`operator ${id} aliases must be an array`);
    } else {
      const aliasTexts = new Set<string>();
      for (const rawAlias of operator.aliases) {
        const alias = rawAlias as Record<string, unknown>;
        const text = String(alias.text ?? '').trim();
        if (!text) issues.push(`operator ${id} has an empty alias`);
        if (aliasTexts.has(text)) issues.push(`operator ${id} has duplicate alias ${text}`);
        aliasTexts.add(text);
        checkVariants(alias, `operator ${id} alias ${text}`, issues);
      }
    }
  }
  if (issues.length) throw new Error(issues.join('\n'));
}
```

- [ ] **Step 6: Run contract tests and type checking**

Run:

```powershell
npx vitest run tests/data/schema.test.ts
npm run typecheck
```

Expected: all tests PASS and TypeScript reports no errors.

- [ ] **Step 7: Commit the foundation**

```powershell
git add package.json package-lock.json tsconfig.json vitest.config.ts src/data tests/data
git commit -m "chore: establish TypeScript data contracts"
```

---

### Task 2: Implement normalization, matching, ranking, and deduplication

**Files:**
- Create: `src/search/normalize.ts`
- Create: `src/search/search.ts`
- Create: `tests/fixtures/operators.ts`
- Create: `tests/search/normalize.test.ts`
- Create: `tests/search/search.test.ts`

**Interfaces:**
- Consumes: `OperatorRecord`, `MatchedBy`, `SearchResult`, `stableIdNumber`.
- Produces: `normalizeSearchText(input)`, `searchOperators(operators, query, limit)`, `findExactOperator(operators, value)`.

- [ ] **Step 1: Write normalization tests**

Create `tests/search/normalize.test.ts`:

```ts
import { expect, it } from 'vitest';
import { normalizeSearchText } from '../../src/search/normalize.js';

it.each([
  [' Ｌｉｎｇ Lan ', 'linglan'],
  ['Lancet-2', 'lancet2'],
  ['Miss.Christine', 'misschristine'],
  ['维娜·维多利亚', '维娜维多利亚'],
  ['U/Official', 'uofficial'],
])('normalizes %s', (input, expected) => {
  expect(normalizeSearchText(input)).toBe(expected);
});
```

- [ ] **Step 2: Add deterministic search fixtures and failing ranking tests**

Create `tests/fixtures/operators.ts` with `铃兰` (`prts:147`), `重岳` (`prts:268`), `忍冬` (`prts:352`), and a synthetic `prts:900` whose alias initials are `ll`.

```ts
import type { OperatorRecord } from '../../src/data/types.js';

const variants = (
  primaryPinyin: string,
  primaryInitials: string,
  alternatePinyin: string[] = [],
  alternateInitials: string[] = [],
) => ({ primaryPinyin, alternatePinyin, primaryInitials, alternateInitials });

export const operators: OperatorRecord[] = [
  {
    id: 'prts:147',
    name: '铃兰',
    avatarUrl: 'https://prts.wiki/images/avatar-linglan.png',
    nameSearch: variants('linglan', 'll'),
    aliases: [],
  },
  {
    id: 'prts:268',
    name: '重岳',
    avatarUrl: 'https://prts.wiki/images/avatar-chongyue.png',
    nameSearch: variants('chongyue', 'cy', ['zhongyue'], ['zy']),
    aliases: [],
  },
  {
    id: 'prts:352',
    name: '忍冬',
    avatarUrl: 'https://prts.wiki/images/avatar-rendong.png',
    nameSearch: variants('rendong', 'rd'),
    aliases: [],
  },
  {
    id: 'prts:900',
    name: '测试干员',
    avatarUrl: 'https://prts.wiki/images/avatar-test.png',
    nameSearch: variants('ceshiganyuan', 'csgy'),
    aliases: [{ text: '来临', ...variants('lailin', 'll') }],
  },
];
```

Create `tests/search/search.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { operators } from '../fixtures/operators.js';
import { findExactOperator, searchOperators } from '../../src/search/search.js';

describe('searchOperators', () => {
  it.each(['铃兰', '铃', 'linglan', 'ling', 'll'])('finds 铃兰 with %s', (query) => {
    expect(searchOperators(operators, query, 8)[0]?.operator.name).toBe('铃兰');
  });

  it.each(['chongyue', 'zhongyue', 'cy', 'zy'])('finds 重岳 with %s', (query) => {
    expect(searchOperators(operators, query, 8)[0]?.operator.name).toBe('重岳');
  });

  it('ranks official initials above alias initials at equal quality', () => {
    const names = searchOperators(operators, 'll', 8).map((result) => result.operator.name);
    expect(names.indexOf('铃兰')).toBeLessThan(names.indexOf('测试干员'));
  });

  it('deduplicates an operator matched by multiple fields and honors the limit', () => {
    const results = searchOperators(operators, 'ling', 8);
    expect(new Set(results.map((result) => result.operator.id)).size).toBe(results.length);
    expect(searchOperators(operators, 'ling', 1)).toHaveLength(1);
  });

  it('resolves only exact official display names as valid', () => {
    expect(findExactOperator(operators, '铃兰')?.id).toBe('prts:147');
    expect(findExactOperator(operators, 'll')).toBeNull();
  });
});
```

- [ ] **Step 3: Run search tests and verify failure**

```powershell
npx vitest run tests/search
```

Expected: FAIL because search modules do not exist.

- [ ] **Step 4: Implement normalization**

Create `src/search/normalize.ts`:

```ts
const IGNORED_SEPARATORS = /[\s\-_.·•/\\]+/gu;

export function normalizeSearchText(input: string): string {
  return input.normalize('NFKC').toLocaleLowerCase('en-US').replace(IGNORED_SEPARATORS, '').trim();
}
```

- [ ] **Step 5: Implement scoring and stable ordering**

Create `src/search/search.ts` with:

```ts
import type { MatchedBy, OperatorRecord, SearchResult } from '../data/types.js';
import { stableIdNumber } from '../data/schema.js';
import { normalizeSearchText } from './normalize.js';

interface CandidateField {
  matchedBy: MatchedBy;
  value: string;
  matchedText: string;
  fieldPriority: number;
}

function qualityOf(value: string, query: string): 1 | 2 | 3 | 0 {
  if (value === query) return 3;
  if (value.startsWith(query)) return 2;
  if (value.includes(query)) return 1;
  return 0;
}

function fieldsOf(operator: OperatorRecord): CandidateField[] {
  const fields: CandidateField[] = [
    { matchedBy: 'name', value: operator.name, matchedText: operator.name, fieldPriority: 10 },
    { matchedBy: 'name-pinyin', value: operator.nameSearch.primaryPinyin, matchedText: operator.name, fieldPriority: 9 },
    ...operator.nameSearch.alternatePinyin.map((value) => ({
      matchedBy: 'name-pinyin-alt' as const, value, matchedText: operator.name, fieldPriority: 8,
    })),
    { matchedBy: 'name-initials', value: operator.nameSearch.primaryInitials, matchedText: operator.name, fieldPriority: 7 },
    ...operator.nameSearch.alternateInitials.map((value) => ({
      matchedBy: 'name-initials-alt' as const, value, matchedText: operator.name, fieldPriority: 6,
    })),
  ];
  for (const alias of operator.aliases) {
    fields.push(
      { matchedBy: 'alias', value: alias.text, matchedText: alias.text, fieldPriority: 5 },
      { matchedBy: 'alias-pinyin', value: alias.primaryPinyin, matchedText: alias.text, fieldPriority: 4 },
      ...alias.alternatePinyin.map((value) => ({
        matchedBy: 'alias-pinyin-alt' as const, value, matchedText: alias.text, fieldPriority: 3,
      })),
      { matchedBy: 'alias-initials', value: alias.primaryInitials, matchedText: alias.text, fieldPriority: 2 },
      ...alias.alternateInitials.map((value) => ({
        matchedBy: 'alias-initials-alt' as const, value, matchedText: alias.text, fieldPriority: 1,
      })),
    );
  }
  return fields;
}

export function searchOperators(
  operators: readonly OperatorRecord[],
  rawQuery: string,
  limit: number,
): SearchResult[] {
  const query = normalizeSearchText(rawQuery);
  if (!query || !Number.isInteger(limit) || limit <= 0) return [];
  const results: SearchResult[] = [];
  for (const operator of operators) {
    let best: SearchResult | null = null;
    for (const field of fieldsOf(operator)) {
      const quality = qualityOf(normalizeSearchText(field.value), query);
      if (!quality) continue;
      const candidate = { operator, matchedBy: field.matchedBy, matchedText: field.matchedText, quality, fieldPriority: field.fieldPriority };
      if (!best || quality > best.quality || (quality === best.quality && field.fieldPriority > best.fieldPriority)) best = candidate;
    }
    if (best) results.push(best);
  }
  return results
    .sort((a, b) => b.quality - a.quality || b.fieldPriority - a.fieldPriority || stableIdNumber(a.operator.id) - stableIdNumber(b.operator.id))
    .slice(0, limit);
}

export function findExactOperator(
  operators: readonly OperatorRecord[],
  value: string,
): OperatorRecord | null {
  return operators.find((operator) => operator.name === value) ?? null;
}
```

- [ ] **Step 6: Run search tests and type checking**

```powershell
npx vitest run tests/search
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit the search core**

```powershell
git add src/search tests/search tests/fixtures/operators.ts
git commit -m "feat: add operator search ranking"
```

---

### Task 3: Implement the cached MediaWiki client and PRTS adapter

**Files:**
- Create: `scripts/lib/mediawiki-client.ts`
- Create: `scripts/lib/prts.ts`
- Create: `tests/fixtures/prts-roster-api.json`
- Create: `tests/fixtures/prts-imageinfo-api.json`
- Create: `tests/updater/mediawiki-client.test.ts`
- Create: `tests/updater/prts.test.ts`

**Interfaces:**
- Produces: `MediaWikiClient.query<T>(params)`.
- Produces: `PrtsOperator`, `parsePrtsRosterWikitext(wikitext, now)`, `fetchPrtsRoster(client, now)`, `fetchPrtsAvatarUrls(client, roster)`.

- [ ] **Step 1: Save minimal real-shape PRTS fixtures**

`tests/fixtures/prts-roster-api.json` must contain an API `parse.wikitext` string with:

```text
sortId,name,rarity,approach,date
-1,预备干员-近战,2,集成战略,2020-08-25 16:00
147,铃兰,5,标准寻访,2020-07-09 16:00
268,重岳,5,限定寻访,2023-01-17 16:00
352,忍冬,5,标准寻访,2024-11-01 16:00
427,予愿安洁莉娜,5,限定寻访,2026-08-01 12:00
```

`tests/fixtures/prts-imageinfo-api.json` must model `query.pages` entries for `File:头像_铃兰.png`, `File:头像_重岳.png`, and `File:头像_忍冬.png`, each with `imageinfo[0].thumburl`.

- [ ] **Step 2: Write failing MediaWiki-client tests**

Test these exact behaviors in `tests/updater/mediawiki-client.test.ts`:

```ts
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { MediaWikiClient } from '../../scripts/lib/mediawiki-client.js';

const cacheDir = () => mkdtemp(join(tmpdir(), 'akni-mediawiki-'));

it('deduplicates identical in-flight queries', async () => {
  const fetchImpl = vi.fn(async () => new Response('{"value":1}', {
    status: 200,
    headers: { etag: '"v1"', 'content-type': 'application/json' },
  }));
  const client = new MediaWikiClient({ endpoint: 'https://example.test/api.php', cacheDir: await cacheDir(), fetchImpl, minIntervalMs: 0 });
  const [left, right] = await Promise.all([client.query({ action: 'query' }), client.query({ action: 'query' })]);
  expect(left).toEqual({ value: 1 });
  expect(right).toEqual({ value: 1 });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

it('uses cached JSON only after a 304 and sends If-None-Match', async () => {
  const fetchImpl = vi.fn()
    .mockResolvedValueOnce(new Response('{"value":1}', { status: 200, headers: { etag: '"v1"' } }))
    .mockResolvedValueOnce(new Response(null, { status: 304 }));
  const directory = await cacheDir();
  await new MediaWikiClient({ endpoint: 'https://example.test/api.php', cacheDir: directory, fetchImpl, minIntervalMs: 0 }).query({ action: 'query' });
  const result = await new MediaWikiClient({ endpoint: 'https://example.test/api.php', cacheDir: directory, fetchImpl, minIntervalMs: 0 }).query({ action: 'query' });
  expect(result).toEqual({ value: 1 });
  expect(fetchImpl.mock.calls[1]?.[1]?.headers).toMatchObject({ 'If-None-Match': '"v1"' });
});

it('never falls back to cached JSON after a network error', async () => {
  const fetchImpl = vi.fn()
    .mockResolvedValueOnce(new Response('{"value":1}', { status: 200, headers: { etag: '"v1"' } }))
    .mockRejectedValue(new Error('offline'));
  const directory = await cacheDir();
  await new MediaWikiClient({ endpoint: 'https://example.test/api.php', cacheDir: directory, fetchImpl, minIntervalMs: 0 }).query({ action: 'query' });
  await expect(new MediaWikiClient({ endpoint: 'https://example.test/api.php', cacheDir: directory, fetchImpl, minIntervalMs: 0 }).query({ action: 'query' })).rejects.toThrow(/offline/);
});

it.each([429, 500, 503])('retries status %s three times', async (status) => {
  const fetchImpl = vi.fn(async () => new Response('failed', { status }));
  const sleep = vi.fn(async () => undefined);
  const client = new MediaWikiClient({ endpoint: 'https://example.test/api.php', cacheDir: await cacheDir(), fetchImpl, sleep, minIntervalMs: 0 });
  await expect(client.query({ action: 'query' })).rejects.toThrow();
  expect(fetchImpl).toHaveBeenCalledTimes(4);
  expect(sleep.mock.calls.map(([milliseconds]) => milliseconds)).toEqual([500, 1000, 2000]);
});

it('does not retry an ordinary 404', async () => {
  const fetchImpl = vi.fn(async () => new Response('missing', { status: 404 }));
  const client = new MediaWikiClient({ endpoint: 'https://example.test/api.php', cacheDir: await cacheDir(), fetchImpl, minIntervalMs: 0 });
  await expect(client.query({ action: 'query' })).rejects.toThrow(/404/);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});
```

Inject `fetch`, `sleep`, and a temporary cache directory so the tests do not use the network.

- [ ] **Step 3: Implement the MediaWiki client**

Create `scripts/lib/mediawiki-client.ts` with this constructor contract:

```ts
export interface MediaWikiClientOptions {
  endpoint: string;
  cacheDir: string;
  minIntervalMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
}

export class MediaWikiClient {
  constructor(options: MediaWikiClientOptions);
  query<T>(params: Record<string, string>): Promise<T>;
}
```

Implementation requirements:

- Always add `format=json` and `formatversion=2`.
- Use `new URL()` and sorted `URLSearchParams`.
- Send `User-Agent: arknights-name-input-data-updater/0.1`.
- Hash the complete URL with SHA-256 for `<cacheDir>/<hash>.json`.
- Cache `{ etag, lastModified, body }`.
- Send conditional headers when metadata exists.
- Use cached body only for HTTP 304.
- Serialize request starts so two requests begin at least `minIntervalMs` apart.
- Retry status 429 and 500–599 with waits of 500, 1000, and 2000 ms.
- Throw a source-labelled error after the final attempt.
- Memoize the promise by URL during one process so identical concurrent calls share one request.

- [ ] **Step 4: Write failing PRTS adapter tests**

Create `tests/updater/prts.test.ts`:

```ts
import { expect, it } from 'vitest';
import rosterResponse from '../fixtures/prts-roster-api.json';
import { parsePrtsRosterWikitext } from '../../scripts/lib/prts.js';

it('keeps released positive sortIds and constructs stable IDs', () => {
  const rows = parsePrtsRosterWikitext(
    rosterResponse.parse.wikitext,
    new Date('2026-07-31T12:00:00+08:00'),
  );
  expect(rows.map((row) => row.id)).toEqual(['prts:147', 'prts:268', 'prts:352']);
  expect(rows.some((row) => row.name === '预备干员-近战')).toBe(false);
  expect(rows.some((row) => row.name === '予愿安洁莉娜')).toBe(false);
});
```

Add tests that `fetchPrtsRoster` sends `action=parse`, `page=干员一览/干员id`, `prop=wikitext`, and that avatar requests batch at 50 titles with `iiurlwidth=96`.

- [ ] **Step 5: Implement the PRTS adapter**

Create `scripts/lib/prts.ts`:

```ts
import { parse } from 'csv-parse/sync';
import type { MediaWikiClient } from './mediawiki-client.js';

export interface PrtsOperator {
  id: `prts:${number}`;
  sortId: number;
  name: string;
  releasedAt: string;
}

export function parsePrtsRosterWikitext(wikitext: string, now: Date): PrtsOperator[] {
  const body = /<pre[^>]*>([\s\S]*?)<\/pre>/i.exec(wikitext)?.[1] ?? wikitext;
  const rows = parse(body, { columns: true, skip_empty_lines: true, trim: true }) as Array<Record<string, string>>;
  return rows.flatMap((row) => {
    const sortId = Number(row.sortId);
    const releasedAt = `${row.date.replace(' ', 'T')}:00+08:00`;
    const timestamp = Date.parse(releasedAt);
    if (!Number.isSafeInteger(sortId) || sortId <= 0 || !row.name || Number.isNaN(timestamp) || timestamp > now.getTime()) return [];
    return [{ id: `prts:${sortId}` as const, sortId, name: row.name, releasedAt }];
  }).sort((a, b) => a.sortId - b.sortId);
}
```

`fetchPrtsAvatarUrls` must query titles in batches of 50, normalize `File:`/`文件:` and underscore/space variants, prefer `thumburl`, fall back to `url`, and return `Map<PrtsOperator['id'], string>`.

- [ ] **Step 6: Run adapter tests**

```powershell
npx vitest run tests/updater/mediawiki-client.test.ts tests/updater/prts.test.ts
npm run typecheck
```

Expected: PASS without network access.

- [ ] **Step 7: Commit the PRTS source boundary**

```powershell
git add scripts/lib/mediawiki-client.ts scripts/lib/prts.ts tests/updater tests/fixtures/prts-*
git commit -m "feat: add PRTS roster adapter"
```

---

### Task 4: Implement the Moegirl `别号` adapter

**Files:**
- Create: `scripts/lib/moegirl.ts`
- Create: `tests/fixtures/moegirl-revisions-api.json`
- Create: `tests/updater/moegirl.test.ts`

**Interfaces:**
- Consumes: `MediaWikiClient`, official PRTS names.
- Produces: `parseMoegirlAliases(wikitext)`.
- Produces: `fetchMoegirlAliases(client, names)` returning `{ aliasesByName, warnings }`.

- [ ] **Step 1: Add a real-shape batch fixture**

Create `tests/fixtures/moegirl-revisions-api.json` with:

- A `忍冬` page whose main-slot wikitext includes `|别号=冬妈`.
- A `重岳` page with two aliases separated by `<br>`.
- A `铃兰` page with an empty `别号`.
- A missing page.
- A redirects array mapping one requested title to its canonical page title.

- [ ] **Step 2: Write failing alias parser tests**

Create `tests/updater/moegirl.test.ts`:

```ts
import { expect, it } from 'vitest';
import { parseMoegirlAliases } from '../../scripts/lib/moegirl.js';

it('extracts only the 别号 field and removes wiki markup', () => {
  const source = [
    '{{人物信息',
    '|代号=示例干员',
    '|别号=[[目标|测试别名]]<ref>说明</ref>',
    '|萌点=测试',
    '}}',
  ].join('\n');
  expect(parseMoegirlAliases(source)).toEqual(['测试别名']);
});

it('splits line breaks and Chinese separators, then deduplicates', () => {
  expect(parseMoegirlAliases('|别号=大哥<br>重岳哥、 大哥\n|性别=男')).toEqual(['大哥', '重岳哥']);
});

it('does not infer aliases from body text or other fields', () => {
  expect(parseMoegirlAliases('|萌点=测试别名\n正文称她为测试别名')).toEqual([]);
});
```

Add a batch-fetch test asserting 50 titles per request, `redirects=1`, `prop=revisions`, `rvslots=main`, and warnings for missing or empty fields.

- [ ] **Step 3: Run tests and verify failure**

```powershell
npx vitest run tests/updater/moegirl.test.ts
```

Expected: FAIL because `scripts/lib/moegirl.ts` does not exist.

- [ ] **Step 4: Implement targeted field parsing**

Create `scripts/lib/moegirl.ts`. The parser must:

1. Locate a line beginning with optional whitespace, `|`, optional whitespace, and `别号=`.
2. Continue through following lines until the next top-level `|字段名=`.
3. Remove `<ref>...</ref>` and self-closing refs.
4. Convert `<br>`, `<br/>`, and `<br />` to separators.
5. Convert `[[target|label]]` to `label` and `[[label]]` to `label`.
6. Reject values that still contain unexpanded `{{...}}`, adding a warning at fetch level.
7. Split on line breaks, `、`, `，`, comma, `；`, semicolon, and slash.
8. trim, remove empty values, and deduplicate while preserving source order.

Use this fetch signature:

```ts
export interface AliasFetchResult {
  aliasesByName: Map<string, string[]>;
  warnings: string[];
}

export async function fetchMoegirlAliases(
  client: MediaWikiClient,
  names: readonly string[],
): Promise<AliasFetchResult>;
```

- [ ] **Step 5: Run Moegirl tests and type checking**

```powershell
npx vitest run tests/updater/moegirl.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit the alias adapter**

```powershell
git add scripts/lib/moegirl.ts tests/updater/moegirl.test.ts tests/fixtures/moegirl-revisions-api.json
git commit -m "feat: extract Moegirl operator aliases"
```

---

### Task 5: Generate pinyin variants and apply curated overrides

**Files:**
- Create: `data/pinyin-overrides.json`
- Create: `scripts/lib/pinyin.ts`
- Create: `tests/updater/pinyin.test.ts`

**Interfaces:**
- Consumes: official names, aliases, stable IDs.
- Produces: `PinyinOverrideFile`, `buildSearchVariants(text, override)`, `loadPinyinOverrides(path)`, `validatePinyinOverrides(overrides, operators)`.

- [ ] **Step 1: Define the committed override for 重岳**

Create `data/pinyin-overrides.json`:

```json
{
  "prts:268": {
    "name": {
      "primary": { "pinyin": "chongyue", "initials": "cy" },
      "alternates": [
        { "pinyin": "zhongyue", "initials": "zy" }
      ]
    },
    "aliases": {}
  }
}
```

- [ ] **Step 2: Write failing pinyin tests**

Create `tests/updater/pinyin.test.ts`:

```ts
import { expect, it } from 'vitest';
import { buildSearchVariants } from '../../scripts/lib/pinyin.js';

it('generates full pinyin and initials for ordinary names', () => {
  expect(buildSearchVariants('铃兰')).toEqual({
    primaryPinyin: 'linglan',
    alternatePinyin: [],
    primaryInitials: 'll',
    alternateInitials: [],
  });
});

it('uses explicit primary and alternate pronunciations', () => {
  expect(buildSearchVariants('重岳', {
    primary: { pinyin: 'chongyue', initials: 'cy' },
    alternates: [{ pinyin: 'zhongyue', initials: 'zy' }],
  })).toEqual({
    primaryPinyin: 'chongyue',
    alternatePinyin: ['zhongyue'],
    primaryInitials: 'cy',
    alternateInitials: ['zy'],
  });
});

it('normalizes mixed Latin, digits, dots, and hyphens', () => {
  expect(buildSearchVariants('Lancet-2').primaryPinyin).toBe('lancet2');
  expect(buildSearchVariants('Miss.Christine').primaryPinyin).toBe('misschristine');
});
```

Add validation tests for an override whose stable ID no longer exists and an alias override whose alias text is absent.

- [ ] **Step 3: Run tests and verify failure**

```powershell
npx vitest run tests/updater/pinyin.test.ts
```

Expected: FAIL because the pinyin module does not exist.

- [ ] **Step 4: Implement pinyin generation**

Create `scripts/lib/pinyin.ts` using the documented pinyin-pro array mode:

```ts
import { readFile } from 'node:fs/promises';
import { pinyin } from 'pinyin-pro';
import { normalizeSearchText } from '../../src/search/normalize.js';
import type { SearchVariants } from '../../src/data/types.js';

export interface Pronunciation {
  pinyin: string;
  initials: string;
}

export interface PronunciationOverride {
  primary: Pronunciation;
  alternates: Pronunciation[];
}

export interface PinyinOverrideEntry {
  name?: PronunciationOverride;
  aliases: Record<string, PronunciationOverride>;
}

export type PinyinOverrideFile = Record<`prts:${number}`, PinyinOverrideEntry>;

export interface OverrideTarget {
  id: `prts:${number}`;
  name: string;
  aliases: string[];
}

export function buildSearchVariants(
  text: string,
  override?: PronunciationOverride,
): SearchVariants {
  if (override) {
    return {
      primaryPinyin: normalizeSearchText(override.primary.pinyin),
      alternatePinyin: override.alternates.map((item) => normalizeSearchText(item.pinyin)),
      primaryInitials: normalizeSearchText(override.primary.initials),
      alternateInitials: override.alternates.map((item) => normalizeSearchText(item.initials)),
    };
  }
  const syllables = pinyin(text, { toneType: 'none', type: 'array', nonZh: 'consecutive' });
  const primaryPinyin = normalizeSearchText(syllables.join(''));
  const primaryInitials = normalizeSearchText(
    pinyin(text, { pattern: 'first', toneType: 'none', type: 'array', nonZh: 'consecutive' }).join(''),
  );
  return { primaryPinyin, alternatePinyin: [], primaryInitials, alternateInitials: [] };
}

export async function loadPinyinOverrides(path: string): Promise<PinyinOverrideFile> {
  return JSON.parse(await readFile(path, 'utf8')) as PinyinOverrideFile;
}

export function validatePinyinOverrides(
  overrides: PinyinOverrideFile,
  targets: readonly OverrideTarget[],
): string[] {
  const targetById = new Map(targets.map((target) => [target.id, target]));
  const issues: string[] = [];
  for (const [id, entry] of Object.entries(overrides)) {
    const target = targetById.get(id as `prts:${number}`);
    if (!target) {
      issues.push(`pinyin override target does not exist: ${id}`);
      continue;
    }
    for (const alias of Object.keys(entry.aliases)) {
      if (!target.aliases.includes(alias)) issues.push(`pinyin alias override does not exist: ${id} ${alias}`);
    }
  }
  return issues;
}
```

Define `PinyinOverrideFile` in the same file as a stable-ID keyed record with optional `name` and alias-text keyed `aliases`.

- [ ] **Step 5: Run pinyin tests and type checking**

```powershell
npx vitest run tests/updater/pinyin.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit pinyin generation**

```powershell
git add data/pinyin-overrides.json scripts/lib/pinyin.ts tests/updater/pinyin.test.ts
git commit -m "feat: add curated pinyin variants"
```

---

### Task 6: Merge, validate, diff, atomically update, and generate the live snapshot

**Files:**
- Create: `scripts/lib/update.ts`
- Create: `scripts/update-data.ts`
- Create: `scripts/check-data.ts`
- Create: `tests/updater/update.test.ts`
- Create: `data/operators.generated.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: PRTS roster/avatar maps, Moegirl aliases/warnings, pinyin overrides, `assertOperatorSnapshot`.
- Produces: `BuildSnapshotInput`, `buildSnapshot(input)`, `diffSnapshots(previous, next)`, `assertSafeUpdate(previous, next, acceptedRemovals)`, `writeJsonAtomic(path, value)`, `runUpdate(options)`.
- Produces CLI flags: `--dry-run`, repeated `--accept-removal=prts:<number>`, optional `--now=<ISO timestamp>` for deterministic source checks.

- [ ] **Step 1: Add updater cache paths to `.gitignore`**

Ensure `.gitignore` contains:

```gitignore
.cache/
dist/
node_modules/
```

- [ ] **Step 2: Write failing merge and safety tests**

Create `tests/updater/update.test.ts` covering:

```ts
it('merges aliases and pinyin into stable-ID ordered operators');
it('keeps duplicate aliases across operators as legal one-to-many data');
it('reports missing Moegirl pages and avatars as warnings');
it('rejects duplicate IDs, duplicate official names, and fewer than 100 live operators');
it('rejects removals unless every removed ID is explicitly accepted');
it('rejects a next snapshot smaller than 90 percent of the previous snapshot');
it('leaves the previous file byte-for-byte unchanged when validation fails');
it('renames a fully written temporary file over the target only after validation');
```

Use temporary directories and injected adapters; never call the real sites in unit tests.

Use this concrete safety-test shape:

```ts
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { assertSafeUpdate, diffSnapshots, writeJsonAtomic } from '../../scripts/lib/update.js';
import { makeSnapshot } from '../fixtures/operators.js';

it('rejects unaccepted removals and a collapse below 90 percent', () => {
  const previous = makeSnapshot(120);
  const next = { ...previous, operators: previous.operators.slice(0, 100) };
  expect(() => assertSafeUpdate(previous, next, new Set())).toThrow(/unaccepted removals/);
  const accepted = new Set(previous.operators.slice(100).map((operator) => operator.id));
  expect(() => assertSafeUpdate(previous, next, accepted)).toThrow(/below 90 percent/);
});

it('accepts only explicitly listed removals when the ratio remains safe', () => {
  const previous = makeSnapshot(120);
  const next = { ...previous, operators: previous.operators.slice(0, 119) };
  expect(() => assertSafeUpdate(previous, next, new Set([previous.operators[119]!.id]))).not.toThrow();
});

it('reports a legal one-to-many alias collision', () => {
  const previous = makeSnapshot(2);
  const next = structuredClone(previous);
  next.operators[0]!.aliases = [{ text: '同名', primaryPinyin: 'tongming', alternatePinyin: [], primaryInitials: 'tm', alternateInitials: [] }];
  next.operators[1]!.aliases = structuredClone(next.operators[0]!.aliases);
  expect(diffSnapshots(previous, next).aliasCollisions).toEqual([{ alias: '同名', ids: [next.operators[0]!.id, next.operators[1]!.id] }]);
});

it('replaces the target only with complete JSON', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'akni-update-'));
  const target = join(directory, 'operators.generated.json');
  await writeFile(target, '{"old":true}\n');
  await writeJsonAtomic(target, makeSnapshot(2));
  expect(JSON.parse(await readFile(target, 'utf8')).operators).toHaveLength(2);
});
```

Add `makeSnapshot(count)` as an explicit helper in `tests/fixtures/operators.ts`; it creates valid unique `prts:1..count` operators with unique names and HTTPS avatar URLs.

- [ ] **Step 3: Run updater tests and verify failure**

```powershell
npx vitest run tests/updater/update.test.ts
```

Expected: FAIL because update orchestration does not exist.

- [ ] **Step 4: Implement snapshot building and diffing**

Create `scripts/lib/update.ts` with these exact result types:

```ts
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
```

`buildSnapshot` must:

- Iterate the sorted PRTS roster.
- Require a PRTS MediaWiki `imageinfo` response containing an HTTPS avatar URL for every operator. A missing or malformed URL is a hard validation error.
- Build official-name and alias pinyin with overrides.
- Run `validatePinyinOverrides`; any stale stable ID or missing alias override is a hard validation error.
- Sort aliases by their normalized text.
- Set source URLs and an injected `generatedAt`.
- Run `assertOperatorSnapshot(snapshot, { minOperators })`.

`diffSnapshots` must compare by stable ID and generate all six report sections.

- [ ] **Step 5: Implement hard safety rules and atomic writes**

`runUpdate` must:

- Use `minOperators: 100` for live updates.
- Reject any removed ID not present in the `acceptedRemovals` set.
- Reject a next count below 90% of the previous count.
- Treat missing Moegirl pages, empty alias fields, and alias collisions as warnings.
- Never replace `data/operators.generated.json` when an exception occurs.
- Write JSON with two-space indentation and a final newline to a sibling `.<filename>.<pid>.tmp`.
- Flush and close the temporary file before `rename`.
- Remove only its own temporary file if rename fails.
- Print all warnings and diff sections; no silent fallback to stale network cache.

- [ ] **Step 6: Implement the two CLIs**

`scripts/update-data.ts` parses:

```text
--dry-run
--accept-removal=prts:123
--now=2026-07-31T12:00:00+08:00
```

It constructs:

- PRTS client at `https://prts.wiki/api.php`.
- Moegirl client at `https://mzh.moegirl.org.cn/api.php`.
- Separate cache directories under `.cache/prts` and `.cache/moegirl`.
- `minIntervalMs: 250` for both sources.

`scripts/check-data.ts` reads `data/operators.generated.json`, runs `assertOperatorSnapshot(snapshot, { minOperators: 100 })`, validates override targets, prints the operator count, and exits nonzero on any issue.

- [ ] **Step 7: Run updater unit tests**

```powershell
npx vitest run tests/updater
npm run typecheck
```

Expected: PASS without network.

- [ ] **Step 8: Generate and inspect the first live snapshot**

Run with approved network access:

```powershell
npm run update-data
npm run check-data
```

Expected:

- `data/operators.generated.json` contains at least 100 records.
- It contains `prts:147` 铃兰, `prts:268` 重岳, and `prts:352` 忍冬.
- 重岳 contains both `chongyue/cy` and `zhongyue/zy`.
- 忍冬 includes its source alias when the source field is present.
- No `sortId = -1` entry is present.
- No entry with a release time after the effective Shanghai update time is present.
- Hard errors are zero; soft warnings are printed explicitly.

- [ ] **Step 9: Commit the update pipeline and snapshot**

```powershell
git add .gitignore scripts data/operators.generated.json tests/updater
git commit -m "feat: generate validated operator snapshot"
```

---

### Task 7: Implement the custom element's public state and event API

**Files:**
- Create: `src/component/arknights-name-input.ts`
- Create: `src/index.ts`
- Create: `tests/component/arknights-name-input.test.ts`

**Interfaces:**
- Consumes: generated `OperatorSnapshot`, `searchOperators`, `findExactOperator`.
- Produces: `ArknightsNameInputElement`, `defineArknightsNameInput()`.
- Public element properties: `value`, `placeholder`, `disabled`, `maxResults`, readonly `valid`, readonly `selectedCharacter`.
- Public methods: `focus()`, `clear()`.
- Public event: `character-select` with `CharacterSelectDetail`.

- [ ] **Step 1: Write failing public-API tests**

Start `tests/component/arknights-name-input.test.ts` with:

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineArknightsNameInput } from '../../src/index.js';

beforeEach(() => {
  defineArknightsNameInput();
  document.body.replaceChildren();
});

it('reflects value, placeholder, disabled, and max-results', () => {
  const element = document.createElement('arknights-name-input');
  element.setAttribute('placeholder', '输入干员');
  element.setAttribute('max-results', '3');
  element.setAttribute('disabled', '');
  document.body.append(element);
  expect(element.placeholder).toBe('输入干员');
  expect(element.maxResults).toBe(3);
  expect(element.disabled).toBe(true);
});

it('marks only exact official display names valid', () => {
  const element = document.createElement('arknights-name-input');
  document.body.append(element);
  element.value = '铃兰';
  expect(element.valid).toBe(true);
  expect(element.selectedCharacter?.id).toBe('prts:147');
  element.value = 'll';
  expect(element.valid).toBe(false);
  expect(element.selectedCharacter).toBeNull();
});

it('does not dispatch user events for programmatic value or clear', () => {
  const element = document.createElement('arknights-name-input');
  const listener = vi.fn();
  element.addEventListener('input', listener);
  document.body.append(element);
  element.value = '铃兰';
  element.clear();
  expect(listener).not.toHaveBeenCalled();
});
```

Add tests for invalid `max-results` falling back to 8 with one warning, and duplicate `defineArknightsNameInput()` calls not throwing.

- [ ] **Step 2: Run the component test and verify failure**

```powershell
npx vitest run tests/component/arknights-name-input.test.ts
```

Expected: FAIL because the element is not implemented.

- [ ] **Step 3: Add the component skeleton**

Create `src/component/arknights-name-input.ts`:

```ts
import type { OperatorRecord, SelectedCharacter } from '../data/types.js';

export class ArknightsNameInputElement extends HTMLElement {
  static observedAttributes = ['value', 'placeholder', 'disabled', 'max-results'];
  static readonly defaultMaxResults = 8;

  readonly #input: HTMLInputElement;
  readonly #list: HTMLDivElement;
  readonly #status: HTMLDivElement;
  #value = '';
  #maxResults = ArknightsNameInputElement.defaultMaxResults;
  #selectedCharacter: SelectedCharacter | null = null;

  constructor(
    private readonly operators: readonly OperatorRecord[],
  ) {
    super();
    const root = this.attachShadow({ mode: 'open', delegatesFocus: true });
    this.#input = document.createElement('input');
    this.#list = document.createElement('div');
    this.#status = document.createElement('div');
    const wrapper = document.createElement('div');
    wrapper.className = 'wrapper';
    wrapper.append(this.#input, this.#list, this.#status);
    root.append(wrapper);
  }
}
```

Implement attribute/property reflection without recursion, exact-name state recomputation through `findExactOperator`, `focus()`, `clear()`, and readonly cloned `selectedCharacter`.

- [ ] **Step 4: Wire generated data and guarded registration**

Create `src/index.ts`:

```ts
import snapshotJson from '../data/operators.generated.json';
import { assertOperatorSnapshot } from './data/schema.js';
import { ArknightsNameInputElement } from './component/arknights-name-input.js';

assertOperatorSnapshot(snapshotJson);

export function defineArknightsNameInput(): void {
  if (customElements.get('arknights-name-input')) return;
  const operators = snapshotJson.operators;
  customElements.define('arknights-name-input', class extends ArknightsNameInputElement {
    constructor() { super(operators); }
  });
}

defineArknightsNameInput();

declare global {
  interface HTMLElementTagNameMap {
    'arknights-name-input': ArknightsNameInputElement;
  }
}
```

- [ ] **Step 5: Implement one-event-per-user-input and selection detail**

Stop the internal input event from escaping, update component state, and dispatch one new `InputEvent('input', { bubbles: true, composed: true, inputType })`.

Implement a private selection method with:

```ts
this.dispatchEvent(new CustomEvent<CharacterSelectDetail>('character-select', {
  bubbles: true,
  composed: true,
  detail: {
    id: result.operator.id,
    name: result.operator.name,
    avatarUrl: result.operator.avatarUrl,
    matchedBy: result.matchedBy,
    matchedText: result.matchedText,
  },
}));
```

- [ ] **Step 6: Run API tests and type checking**

```powershell
npx vitest run tests/component/arknights-name-input.test.ts
npm run typecheck
```

Expected: public API tests PASS.

- [ ] **Step 7: Commit the public element API**

```powershell
git add src/component src/index.ts tests/component
git commit -m "feat: add Arknights name input element"
```

---

### Task 8: Add dropdown rendering, accessibility, input-method handling, and avatar degradation

**Files:**
- Modify: `src/component/arknights-name-input.ts`
- Create: `src/component/styles.ts`
- Modify: `tests/component/arknights-name-input.test.ts`

**Interfaces:**
- Consumes: `searchOperators(operators, query, maxResults)`.
- Preserves all Task 7 public APIs.
- Produces internal combobox/listbox behavior and at most `maxResults` rendered `<img>` elements per query.

- [ ] **Step 1: Add failing interaction and accessibility tests**

Add tests that:

```ts
it('opens at most maxResults options and images');
it('moves aria-activedescendant with ArrowDown and ArrowUp');
it('selects the active option with Enter and closes with Escape');
it('selects an option by pointer without losing the input first');
it('does not search during composition and searches once after compositionend');
it('keeps free text and renders 未找到干员 for no matches');
it('closes on focus leaving the component without clearing text');
it('hides a failed image and leaves the option selectable');
it('emits one composed character-select event with matchedBy and matchedText');
```

For the image count assertion:

```ts
element.maxResults = 2;
input.value = 'l';
input.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
expect(shadow.querySelectorAll('[role="option"]')).toHaveLength(2);
expect(shadow.querySelectorAll('[role="option"] img')).toHaveLength(2);
```

- [ ] **Step 2: Run interaction tests and verify failure**

```powershell
npx vitest run tests/component/arknights-name-input.test.ts
```

Expected: new interaction tests FAIL.

- [ ] **Step 3: Implement combobox DOM and ARIA state**

Configure:

```ts
this.#input.setAttribute('role', 'combobox');
this.#input.setAttribute('aria-autocomplete', 'list');
this.#input.setAttribute('aria-controls', this.#listId);
this.#input.setAttribute('aria-expanded', 'false');
this.#list.id = this.#listId;
this.#list.setAttribute('role', 'listbox');
this.#status.setAttribute('role', 'status');
this.#status.setAttribute('aria-live', 'polite');
```

Each result is a `div[role=option]` with deterministic ID `${listId}-option-${index}`, `aria-selected`, an image, and a name span. Update `aria-expanded`, `aria-activedescendant`, and status text after every render.

- [ ] **Step 4: Implement keyboard, pointer, focus, and IME behavior**

Maintain `#results`, `#activeIndex`, and `#isComposing`.

- `compositionstart`: set composing and do not search.
- `compositionend`: clear composing, update value, search once, dispatch one outer input event.
- `ArrowDown`/`ArrowUp`: wrap inside current results and prevent default.
- `Enter`: select active result and prevent default.
- `Escape`: close results without changing value.
- Option `pointerdown`: prevent default so the input does not blur before click.
- Option `click`: select.
- `focusout`: `queueMicrotask(() => { if (!this.matches(':focus-within')) this.#closeResults(); })`.

- [ ] **Step 5: Implement bounded avatar rendering and failure handling**

Render exactly one `<img>` for each displayed result, never for off-screen search results. Set:

```ts
image.alt = '';
image.decoding = 'async';
image.src = result.operator.avatarUrl;
image.addEventListener('error', () => {
  image.hidden = true;
  option.classList.add('avatar-failed');
}, { once: true });
```

Do not use `fetch`, Blob URLs, global preload, or a background avatar queue.

- [ ] **Step 6: Implement the approved Shadow DOM styles**

Create `src/component/styles.ts` exporting one CSS string that defines and consumes:

```css
:host {
  --akni-width: 100%;
  --akni-font-family: system-ui, sans-serif;
  --akni-font-size: 14px;
  --akni-text-color: #202632;
  --akni-background: #ffffff;
  --akni-border-color: #b8c0cc;
  --akni-accent-color: #2864dc;
  --akni-radius: 6px;
  --akni-input-height: 40px;
  --akni-option-height: 44px;
  --akni-list-max-height: 320px;
  --akni-z-index: 1000;
}
```

The list must be absolutely positioned under a relatively positioned wrapper, scroll after `--akni-list-max-height`, use the configured z-index, and collapse avatar space under `.avatar-failed`.

Import `componentStyles` in the element constructor and attach it before the interactive DOM:

```ts
const style = document.createElement('style');
style.textContent = componentStyles;
root.append(style, wrapper);
```

- [ ] **Step 7: Run all component and search tests**

```powershell
npx vitest run tests/component tests/search
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit complete component interaction**

```powershell
git add src/component tests/component
git commit -m "feat: complete autocomplete interaction"
```

---

### Task 9: Build the IIFE, document integration, and verify real browsers

**Files:**
- Create: `scripts/build.mjs`
- Create: `scripts/serve-static.ts`
- Create: `playwright.config.ts`
- Create: `tests/e2e/component.spec.ts`
- Create: `demo/index.html`
- Create: `README.md`

**Interfaces:**
- Consumes: `src/index.ts`, generated snapshot, public Web Component API.
- Produces: `dist/arknights-name-input.js`.
- Produces documented simple and event-driven host integrations.

- [ ] **Step 1: Implement the production build**

Create `scripts/build.mjs`:

```js
import { mkdir } from 'node:fs/promises';
import { build } from 'esbuild';

await mkdir('dist', { recursive: true });
await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/arknights-name-input.js',
  bundle: true,
  minify: true,
  sourcemap: true,
  platform: 'browser',
  format: 'iife',
  target: ['es2020'],
  legalComments: 'eof',
});
```

Run:

```powershell
npm run build
```

Expected: `dist/arknights-name-input.js` and source map exist; the JS contains no `import` statement.

- [ ] **Step 2: Add a static server and demo page**

`scripts/serve-static.ts` must serve the repository root on `127.0.0.1`, use `PORT` or default `4173`, reject `..` traversal, and map `/` to `demo/index.html`.

Create `demo/index.html` using:

```html
<script src="/dist/arknights-name-input.js"></script>
<arknights-name-input
  id="operator"
  placeholder="输入干员名称、拼音或别号"
  max-results="8"
></arknights-name-input>
<pre id="output">尚未选择</pre>
<script>
  document.querySelector('#operator').addEventListener('character-select', (event) => {
    document.querySelector('#output').textContent = JSON.stringify(event.detail, null, 2);
  });
</script>
```

- [ ] **Step 3: Configure Playwright browser projects**

Create `playwright.config.ts` with:

- `webServer.command: 'npm run demo'`
- URL `http://127.0.0.1:4173`
- Projects `chromium`, `firefox`, `webkit`, `mobile-chromium` using Pixel 7, and `mobile-webkit` using iPhone 15.
- Trace on first retry and screenshot on failure.

Install browsers:

```powershell
npx playwright install chromium firefox webkit
```

- [ ] **Step 4: Write browser-level acceptance tests**

Create `tests/e2e/component.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://prts.wiki/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
    });
  });
  await page.goto('/');
});

test('searches initials, pinyin, aliases, and alternate pronunciations', async ({ page }) => {
  const component = page.locator('arknights-name-input');
  const input = component.locator('input');
  for (const [query, expected] of [
    ['ll', '铃兰'],
    ['linglanma', '忍冬'],
    ['zhongyue', '重岳'],
  ] as const) {
    await input.fill(query);
    await expect(component.locator('[role=option]').first()).toContainText(expected);
  }
});

test('selects with the keyboard and emits detail', async ({ page }) => {
  const component = page.locator('arknights-name-input');
  const input = component.locator('input');
  await input.fill('ll');
  await input.press('ArrowDown');
  await input.press('Enter');
  await expect(input).toHaveValue('铃兰');
  await expect(page.locator('#output')).toContainText('"id": "prts:147"');
});

test('keeps working when avatars fail', async ({ page }) => {
  await page.unroute('https://prts.wiki/**');
  await page.route('https://prts.wiki/**', (route) => route.abort());
  const component = page.locator('arknights-name-input');
  const input = component.locator('input');
  await input.fill('ll');
  await component.locator('[role=option]').first().click();
  await expect(input).toHaveValue('铃兰');
});
```

Add assertions for max-results, touch/click selection, `aria-expanded`, `aria-activedescendant`, Escape, and free text.

- [ ] **Step 5: Write README integration and maintenance documentation**

`README.md` must contain:

- One-script/one-tag quick start.
- Attributes, properties, methods, events, `matchedBy` values, and CSS variable table.
- Minimal usage that reads only `.value`.
- Advanced usage that listens to `character-select`.
- Free-text and `valid` semantics.
- Avatar runtime dependency and failure behavior.
- `npm run update-data`, `npm run check-data`, `npm run build`, `npm test`, and `npm run test:e2e`.
- Pinyin override JSON example for 重岳.
- PRTS and Moegirl source links, generated timestamp location, and a note to verify current usage/attribution terms before redistribution.
- Explicit exclusions: NPCs, enemies, occupation/rarity display, fuzzy typo correction, and full avatar preload.

- [ ] **Step 6: Run the complete verification suite**

Run separately:

```powershell
npm run check-data
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Expected:

- Data check passes with at least 100 operators.
- All unit and component tests pass.
- IIFE build succeeds.
- All five Playwright projects pass.
- No test performs live Wiki data access.
- Runtime avatar failure does not fail E2E.

- [ ] **Step 7: Inspect the production artifact and repository state**

Run:

```powershell
Get-Item -LiteralPath 'dist\arknights-name-input.js' | Select-Object Name, Length
Select-String -LiteralPath 'dist\arknights-name-input.js' -Pattern 'from "'
git status --short
```

Expected: the artifact exists, no ESM import is found, and only intended task files are modified.

- [ ] **Step 8: Commit packaging, documentation, and browser verification**

```powershell
git add scripts/build.mjs scripts/serve-static.ts playwright.config.ts tests/e2e demo README.md
git commit -m "docs: package and verify embeddable input"
```

## Final Acceptance Checklist

- [ ] `npm run update-data` prints source-labelled warnings and an explicit diff, then atomically writes only after validation.
- [ ] `npm run check-data` rejects malformed, duplicate, empty, or implausibly small snapshots.
- [ ] `ll` ranks 铃兰 above alias-initial-only matches.
- [ ] `chongyue`, `zhongyue`, `cy`, and `zy` match 重岳.
- [ ] Duplicate aliases return every mapped operator up to `maxResults`.
- [ ] Direct exact official-name entry sets `valid=true` without fabricating `character-select`.
- [ ] Programmatic `value` and `clear()` do not fabricate user events.
- [ ] Mouse, touch, keyboard, Escape, blur, and IME composition behavior pass.
- [ ] Each query renders no more than `maxResults` avatar elements.
- [ ] Broken PRTS images collapse to name-only options.
- [ ] Host CSS cannot style internal elements except through documented variables.
- [ ] Repeated script execution does not re-register the custom element.
- [ ] `dist/arknights-name-input.js` works from a plain HTML page without npm or a framework.
- [ ] Chromium, Firefox, WebKit, mobile Chromium, and mobile WebKit E2E projects pass.
