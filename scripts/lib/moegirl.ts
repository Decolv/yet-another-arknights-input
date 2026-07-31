import type { MediaWikiClient } from './mediawiki-client.js';

interface MoegirlPage {
  title?: unknown;
  missing?: unknown;
  revisions?: unknown;
}

interface MoegirlResponse {
  query?: {
    pages?: unknown;
    redirects?: unknown;
  };
}

export interface MoegirlAliasResult {
  aliasesByName: Map<string, string[]>;
  warnings: string[];
}

export function parseMoegirlAliases(wikitext: string): string[] {
  const value = aliasField(wikitext);
  if (value === undefined) return [];
  return cleanAliasValue(value);
}

export async function fetchMoegirlAliases(
  client: MediaWikiClient,
  names: readonly string[],
): Promise<MoegirlAliasResult> {
  const aliasesByName = new Map<string, string[]>();
  const warnings: string[] = [];

  for (let offset = 0; offset < names.length; offset += 50) {
    const batch = names.slice(offset, offset + 50);
    const response = await client.query<MoegirlResponse>({
      action: 'query',
      prop: 'revisions',
      rvslots: 'main',
      rvprop: 'content',
      redirects: '1',
      titles: batch.join('|'),
    });
    const requestedNames = requestedNamesByTitle(batch, response.query?.redirects);
    for (const page of pagesFrom(response)) {
      if (typeof page.title !== 'string') continue;
      const pageNames = requestedNames.get(page.title) ?? [];
      if (page.missing !== undefined) {
        for (const name of pageNames) warnings.push(`Moegirl page ${name} is missing`);
        continue;
      }
      const wikitext = revisionContent(page);
      const value = wikitext === undefined ? undefined : aliasField(wikitext);
      for (const name of pageNames) {
        if (value === undefined) {
          warnings.push(`Moegirl page ${name} has no 别号 field`);
        } else if (/\{\{[\s\S]*?\}\}/.test(value)) {
          warnings.push(`Moegirl page ${name} has an unexpanded 别号 template`);
        } else {
          const aliases = cleanAliasValue(value);
          if (aliases.length === 0) warnings.push(`Moegirl page ${name} has an empty 别号 field`);
          else aliasesByName.set(name, aliases);
        }
      }
    }
  }

  return { aliasesByName, warnings };
}

function aliasField(wikitext: string): string | undefined {
  const match = /(?:^|\n)\s*\|\s*别号\s*=([\s\S]*?)(?=\n\s*\|\s*[^=\n]+\s*=|$)/.exec(wikitext);
  return match?.[1];
}

function cleanAliasValue(value: string): string[] {
  const stripped = value
    .replace(/<ref\b[^>]*>[\s\S]*?<\/ref\s*>/gi, '')
    .replace(/<ref\b[^>]*\/\s*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1');
  const aliases: string[] = [];
  for (const part of stripped.split(/[\n、，,；;\/]/)) {
    const alias = part.trim();
    if (alias && !aliases.includes(alias)) aliases.push(alias);
  }
  return aliases;
}

function requestedNamesByTitle(batch: readonly string[], redirects: unknown): Map<string, string[]> {
  const namesByTitle = new Map(batch.map((name) => [name, [name]]));
  if (!Array.isArray(redirects)) return namesByTitle;
  for (const redirect of redirects) {
    if (!redirect || typeof redirect !== 'object') continue;
    const { from, to } = redirect as Record<string, unknown>;
    if (typeof from !== 'string' || typeof to !== 'string') continue;
    const requested = namesByTitle.get(from);
    if (!requested) continue;
    const target = namesByTitle.get(to) ?? [];
    namesByTitle.set(to, [...target, ...requested]);
  }
  return namesByTitle;
}

function pagesFrom(response: MoegirlResponse): MoegirlPage[] {
  const pages = response.query?.pages;
  if (Array.isArray(pages)) return pages as MoegirlPage[];
  if (pages && typeof pages === 'object') return Object.values(pages as Record<string, MoegirlPage>);
  return [];
}

function revisionContent(page: MoegirlPage): string | undefined {
  const revision = Array.isArray(page.revisions) ? page.revisions[0] : undefined;
  if (!revision || typeof revision !== 'object') return undefined;
  const slots = (revision as { slots?: unknown }).slots;
  if (!slots || typeof slots !== 'object') return undefined;
  const main = (slots as { main?: unknown }).main;
  if (!main || typeof main !== 'object') return undefined;
  const content = (main as { content?: unknown }).content;
  return typeof content === 'string' ? content : undefined;
}
