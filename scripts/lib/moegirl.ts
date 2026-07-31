import { JSDOM } from 'jsdom';
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

export interface MoegirlRenderedPageClient {
  fetchRenderedPage(title: string): Promise<string>;
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
      origin: '*',
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
        } else if (/\{\{/.test(value)) {
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

export async function fetchMoegirlRenderedAliases(
  client: MoegirlRenderedPageClient,
  names: readonly string[],
): Promise<MoegirlAliasResult> {
  const results = new Array<{ aliases?: string[]; warning?: string; hardError?: string }>(names.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(2, names.length) }, async () => {
    while (nextIndex < names.length) {
      const index = nextIndex;
      nextIndex += 1;
      const name = names[index]!;
      try {
        const html = await client.fetchRenderedPage(name);
        const parsed = parseRenderedAliasField(html);
        if (parsed === undefined) {
          results[index] = { warning: `Moegirl page ${name} has no 别号 field` };
        } else if (parsed.length === 0) {
          results[index] = { warning: `Moegirl page ${name} has an empty 别号 field` };
        } else {
          results[index] = { aliases: parsed };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results[index] = /HTTP 404\b/.test(message)
          ? { warning: `Moegirl page ${name} is missing` }
          : { hardError: `Moegirl page ${name} fetch failed: ${message}` };
      }
    }
  });
  await Promise.all(workers);

  const aliasesByName = new Map<string, string[]>();
  const warnings: string[] = [];
  const hardErrors: string[] = [];
  results.forEach((result, index) => {
    if (result?.aliases) aliasesByName.set(names[index]!, result.aliases);
    if (result?.warning) warnings.push(result.warning);
    if (result?.hardError) hardErrors.push(result.hardError);
  });
  if (hardErrors.length > 0) {
    throw new Error(`Moegirl rendered page failures:\n${hardErrors.join('\n')}`);
  }
  return { aliasesByName, warnings };
}

function aliasField(wikitext: string): string | undefined {
  const match = /(?:^|\n)\s*\|\s*别号\s*=/.exec(wikitext);
  if (!match) return undefined;
  const start = match.index + match[0].length;
  let templateDepth = 0;
  let refDepth = 0;
  let index = start;
  while (index < wikitext.length) {
    if (wikitext.startsWith('{{', index)) {
      templateDepth += 1;
      index += 2;
    } else if (wikitext.startsWith('}}', index) && templateDepth > 0) {
      templateDepth -= 1;
      index += 2;
    } else if (wikitext[index] === '<') {
      const tag = /^<\/?ref\b[^>]*>/i.exec(wikitext.slice(index));
      if (tag) {
        if (/^<\/ref\b/i.test(tag[0])) refDepth = Math.max(0, refDepth - 1);
        else if (!/\/\s*>$/.test(tag[0])) refDepth += 1;
        index += tag[0].length;
      } else index += 1;
    } else if (wikitext[index] === '\n' && templateDepth === 0 && refDepth === 0
      && /^\n\s*\|\s*[^=\n]+\s*=/.test(wikitext.slice(index))) {
      return wikitext.slice(start, index);
    } else {
      index += 1;
    }
  }
  return wikitext.slice(start);
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

function parseRenderedAliasField(html: string): string[] | undefined {
  const dom = new JSDOM(html);
  try {
    const informationBox = dom.window.document.querySelector('.infotemplatebox');
    if (!informationBox) return undefined;
    const heading = [...informationBox.querySelectorAll('th')]
      .find((element) => element.textContent?.trim() === '别号');
    if (!heading) return undefined;
    const cell = [...(heading.parentElement?.children ?? [])]
      .find((element) => element.tagName === 'TD');
    if (!cell) return [];
    const values = [...cell.querySelectorAll('[itemprop="nickname"]')].map((element) => {
      const copy = element.cloneNode(true) as Element;
      copy.querySelectorAll('.reference, sup').forEach((reference) => reference.remove());
      copy.querySelectorAll('br').forEach((lineBreak) => {
        lineBreak.replaceWith(dom.window.document.createTextNode('\n'));
      });
      return copy.textContent ?? '';
    });
    return cleanAliasValue(values.join('\n'));
  } finally {
    dom.window.close();
  }
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
