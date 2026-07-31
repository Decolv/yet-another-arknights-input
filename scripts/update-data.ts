import { fileURLToPath } from 'node:url';
import { MediaWikiClient } from './lib/mediawiki-client.js';
import { fetchMoegirlRenderedAliases } from './lib/moegirl.js';
import { loadPinyinOverrides } from './lib/pinyin.js';
import { fetchPrtsAvatarUrls, fetchPrtsRoster } from './lib/prts.js';
import { runUpdate, type UpdateDiff } from './lib/update.js';

const PRTS_ENDPOINT = 'https://prts.wiki/api.php';
const MOEGIRL_ENDPOINT = 'https://mzh.moegirl.org.cn/api.php';
const targetPath = fileURLToPath(new URL('../data/operators.generated.json', import.meta.url));
const overridePath = fileURLToPath(new URL('../data/pinyin-overrides.json', import.meta.url));

function parseArguments(arguments_: readonly string[]): {
  dryRun: boolean;
  acceptedRemovals: Set<string>;
  now: Date;
} {
  let dryRun = false;
  let now = new Date();
  const acceptedRemovals = new Set<string>();
  for (const argument of arguments_) {
    if (argument === '--dry-run') {
      dryRun = true;
    } else if (argument.startsWith('--accept-removal=')) {
      const id = argument.slice('--accept-removal='.length);
      if (!/^prts:[1-9]\d*$/.test(id)) throw new Error(`invalid accepted removal: ${id}`);
      acceptedRemovals.add(id);
    } else if (argument.startsWith('--now=')) {
      const value = argument.slice('--now='.length);
      const parsed = new Date(value);
      if (!value || Number.isNaN(parsed.getTime())) throw new Error(`invalid --now timestamp: ${value}`);
      now = parsed;
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  return { dryRun, acceptedRemovals, now };
}

function printSection(name: keyof UpdateDiff, value: UpdateDiff[keyof UpdateDiff]): void {
  console.log(`${name}: ${JSON.stringify(value)}`);
}

async function main(): Promise<void> {
  const arguments_ = parseArguments(process.argv.slice(2));
  const prtsClient = new MediaWikiClient({
    endpoint: PRTS_ENDPOINT,
    cacheDir: fileURLToPath(new URL('../.cache/prts/', import.meta.url)),
    minIntervalMs: 250,
  });
  const moegirlClient = new MediaWikiClient({
    endpoint: MOEGIRL_ENDPOINT,
    cacheDir: fileURLToPath(new URL('../.cache/moegirl/', import.meta.url)),
    minIntervalMs: 250,
  });
  const report = await runUpdate({
    targetPath,
    now: arguments_.now,
    acceptedRemovals: arguments_.acceptedRemovals,
    overrides: loadPinyinOverrides(overridePath),
    dryRun: arguments_.dryRun,
    sources: {
      fetchRoster: (now) => fetchPrtsRoster(prtsClient, now),
      fetchAvatarUrls: (roster) => fetchPrtsAvatarUrls(prtsClient, roster),
      fetchAliases: async (names) => {
        console.log(`Moegirl rendered pages requested: ${names.length}`);
        try {
          return await fetchMoegirlRenderedAliases(moegirlClient, names);
        } finally {
          console.log(`Moegirl rendered pages processed: ${names.length}`);
        }
      },
    },
  });

  for (const warning of report.warnings) console.warn(`warning: ${warning}`);
  for (const section of Object.keys(report.diff) as Array<keyof UpdateDiff>) {
    printSection(section, report.diff[section]);
  }
  console.log(`${report.written ? 'wrote' : 'dry-run'} ${report.snapshot.operators.length} operators`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
