import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { assertOperatorSnapshot } from '../src/data/schema.js';
import type { OperatorRecord, OperatorSnapshot } from '../src/data/types.js';
import { buildSearchVariants, loadPinyinOverrides } from './lib/pinyin.js';
import { writeJsonAtomic } from './lib/update.js';

const snapshotPath = fileURLToPath(new URL('../data/operators.generated.json', import.meta.url));
const overridePath = fileURLToPath(new URL('../data/pinyin-overrides.json', import.meta.url));

/** 只重算 nameSearch / aliases 的拼音字段，不联网、不动干员名单与头像。 */
async function main(): Promise<void> {
  const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8')) as OperatorSnapshot;
  const overrides = loadPinyinOverrides(overridePath);
  let changed = 0;

  const operators: OperatorRecord[] = snapshot.operators.map((operator) => {
    const override = overrides[operator.id];
    const refreshed: OperatorRecord = {
      ...operator,
      nameSearch: buildSearchVariants(operator.name, override?.name),
      aliases: operator.aliases.map((alias) => ({
        text: alias.text,
        ...buildSearchVariants(alias.text, override?.aliases?.[alias.text]),
      })),
    };
    if (JSON.stringify(refreshed) !== JSON.stringify(operator)) changed += 1;
    return refreshed;
  });

  const next: OperatorSnapshot = { ...snapshot, operators };
  assertOperatorSnapshot(next, { minOperators: 100 });

  if (changed === 0) {
    console.log('nameSearch 已是最新，未写入');
    return;
  }

  await writeJsonAtomic(snapshotPath, next);
  console.log(`已重算 nameSearch：${changed} / ${operators.length} 位干员有变化`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
