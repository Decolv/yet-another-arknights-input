import type { OperatorSnapshot } from './types.js';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

function hasHttpsUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function validateVariants(value: unknown, path: string, issues: string[]): void {
  if (!isRecord(value)) {
    issues.push(`${path} must be an object`);
    return;
  }

  for (const field of ['primaryPinyin', 'primaryInitials'] as const) {
    if (!isNonEmptyString(value[field])) issues.push(`${path}.${field} must be a nonempty string`);
  }
  for (const field of ['alternatePinyin', 'alternateInitials'] as const) {
    const variants = value[field];
    if (!Array.isArray(variants) || variants.some((item) => !isNonEmptyString(item))) {
      issues.push(`${path}.${field} must be an array of nonempty strings`);
    }
  }
}

export function stableIdNumber(id: string): number {
  const match = /^prts:([1-9]\d*)$/.exec(id);
  const number = match === null ? Number.NaN : Number(match[1]);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`operator id must match prts:<positive integer>: ${id}`);
  }
  return number;
}

export function assertOperatorSnapshot(
  value: unknown,
  { minOperators = 1 }: { minOperators?: number } = {},
): asserts value is OperatorSnapshot {
  const issues: string[] = [];
  if (!isRecord(value)) {
    throw new Error('snapshot must be an object');
  }

  if (value.schemaVersion !== 1) issues.push('schemaVersion must be 1');
  if (!isIsoTimestamp(value.generatedAt)) issues.push('generatedAt must be a valid ISO timestamp');

  if (!isRecord(value.sources)) {
    issues.push('sources must be an object');
  } else {
    for (const source of ['prts', 'moegirl'] as const) {
      if (!isNonEmptyString(value.sources[source])) issues.push(`sources.${source} must be a nonempty string`);
    }
  }

  if (!Array.isArray(value.operators)) {
    issues.push('operators must be an array');
  } else {
    if (value.operators.length < minOperators) issues.push(`operators must contain at least ${minOperators} records`);
    const ids = new Set<string>();
    const names = new Set<string>();
    value.operators.forEach((operator, index) => {
      const path = `operators[${index}]`;
      if (!isRecord(operator)) {
        issues.push(`${path} must be an object`);
        return;
      }

      if (typeof operator.id !== 'string') {
        issues.push(`operator id must match prts:<positive integer>: ${String(operator.id)}`);
      } else {
        try {
          stableIdNumber(operator.id);
          if (ids.has(operator.id)) issues.push(`duplicate operator id ${operator.id}`);
          ids.add(operator.id);
        } catch (error) {
          issues.push(error instanceof Error ? error.message : String(error));
        }
      }

      if (!isNonEmptyString(operator.name)) {
        issues.push(`${path}.name must be a nonempty string`);
      } else {
        if (names.has(operator.name)) issues.push(`duplicate operator name ${operator.name}`);
        names.add(operator.name);
      }

      if (!hasHttpsUrl(operator.avatarUrl)) issues.push(`${path}.avatarUrl must be an HTTPS URL`);
      validateVariants(operator.nameSearch, `${path}.nameSearch`, issues);

      if (!Array.isArray(operator.aliases)) {
        issues.push(`${path}.aliases must be an array`);
        return;
      }
      const aliases = new Set<string>();
      operator.aliases.forEach((alias, aliasIndex) => {
        const aliasPath = `${path}.aliases[${aliasIndex}]`;
        if (!isRecord(alias)) {
          issues.push(`${aliasPath} must be an object`);
          return;
        }
        if (!isNonEmptyString(alias.text)) {
          issues.push(`${aliasPath}.text must be a nonempty string`);
        } else {
          if (aliases.has(alias.text)) issues.push(`duplicate alias text ${alias.text} for operator ${operator.name ?? index}`);
          aliases.add(alias.text);
        }
        validateVariants(alias, aliasPath, issues);
      });
    });
  }

  if (issues.length > 0) throw new Error(issues.join('\n'));
}
