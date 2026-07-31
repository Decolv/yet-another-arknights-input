import { stableIdNumber } from '../data/schema.js';
import type { AliasRecord, MatchedBy, OperatorRecord, SearchResult } from '../data/types.js';
import { normalizeSearchText } from './normalize.js';

interface SearchField {
  matchedBy: MatchedBy;
  matchedText: string;
  priority: number;
  value: string;
}

function matchQuality(value: string, query: string): 0 | 1 | 2 | 3 {
  if (value === query) return 3;
  if (value.startsWith(query)) return 2;
  if (value.includes(query)) return 1;
  return 0;
}

function aliasFields(alias: AliasRecord): SearchField[] {
  return [
    { matchedBy: 'alias', matchedText: alias.text, priority: 5, value: alias.text },
    { matchedBy: 'alias-pinyin', matchedText: alias.text, priority: 4, value: alias.primaryPinyin },
    ...alias.alternatePinyin.map((value): SearchField => ({ matchedBy: 'alias-pinyin-alt', matchedText: alias.text, priority: 3, value })),
    { matchedBy: 'alias-initials', matchedText: alias.text, priority: 2, value: alias.primaryInitials },
    ...alias.alternateInitials.map((value): SearchField => ({ matchedBy: 'alias-initials-alt', matchedText: alias.text, priority: 1, value })),
  ];
}

function operatorFields(operator: OperatorRecord): SearchField[] {
  return [
    { matchedBy: 'name', matchedText: operator.name, priority: 10, value: operator.name },
    { matchedBy: 'name-pinyin', matchedText: operator.name, priority: 9, value: operator.nameSearch.primaryPinyin },
    ...operator.nameSearch.alternatePinyin.map((value): SearchField => ({ matchedBy: 'name-pinyin-alt', matchedText: operator.name, priority: 8, value })),
    { matchedBy: 'name-initials', matchedText: operator.name, priority: 7, value: operator.nameSearch.primaryInitials },
    ...operator.nameSearch.alternateInitials.map((value): SearchField => ({ matchedBy: 'name-initials-alt', matchedText: operator.name, priority: 6, value })),
    ...operator.aliases.flatMap(aliasFields),
  ];
}

function bestMatch(operator: OperatorRecord, query: string): SearchResult | null {
  let best: SearchResult | null = null;

  for (const field of operatorFields(operator)) {
    const quality = matchQuality(normalizeSearchText(field.value), query);
    if (quality === 0) continue;
    if (best === null || quality > best.quality || (quality === best.quality && field.priority > best.fieldPriority)) {
      best = { operator, matchedBy: field.matchedBy, matchedText: field.matchedText, quality, fieldPriority: field.priority };
    }
  }

  return best;
}

export function searchOperators(operators: readonly OperatorRecord[], query: string, limit: number): SearchResult[] {
  const normalizedQuery = normalizeSearchText(query);
  if (normalizedQuery.length === 0 || !Number.isInteger(limit) || limit <= 0) return [];

  return operators
    .map((operator) => bestMatch(operator, normalizedQuery))
    .filter((result): result is SearchResult => result !== null)
    .sort((left, right) => right.quality - left.quality || right.fieldPriority - left.fieldPriority || stableIdNumber(left.operator.id) - stableIdNumber(right.operator.id))
    .slice(0, limit);
}

export function findExactOperator(operators: readonly OperatorRecord[], value: string): OperatorRecord | null {
  return operators.find((operator) => operator.name === value) ?? null;
}
