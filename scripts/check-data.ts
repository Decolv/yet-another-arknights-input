import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { assertOperatorSnapshot } from '../src/data/schema.js';
import { loadPinyinOverrides, validatePinyinOverrides } from './lib/pinyin.js';

const snapshotPath = fileURLToPath(new URL('../data/operators.generated.json', import.meta.url));
const overridePath = fileURLToPath(new URL('../data/pinyin-overrides.json', import.meta.url));

async function main(): Promise<void> {
  const snapshot: unknown = JSON.parse(await readFile(snapshotPath, 'utf8'));
  assertOperatorSnapshot(snapshot, { minOperators: 100 });
  const errors = validatePinyinOverrides(
    loadPinyinOverrides(overridePath),
    snapshot.operators.map((operator) => ({
      id: operator.id,
      name: operator.name,
      aliases: operator.aliases.map(({ text }) => text),
    })),
  );
  if (errors.length > 0) throw new Error(errors.join('\n'));
  console.log(`operators: ${snapshot.operators.length}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
