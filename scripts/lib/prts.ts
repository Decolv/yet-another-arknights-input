import { parse } from 'csv-parse/sync';
import type { MediaWikiClient } from './mediawiki-client.js';

export interface PrtsOperator {
  id: `prts:${number}`;
  sortId: number;
  name: string;
  releasedAt: string;
}

interface PrtsRosterResponse {
  parse?: { wikitext?: unknown };
}

interface PrtsImageInfoResponse {
  query?: { pages?: unknown };
}

interface ImagePage {
  title?: unknown;
  imageinfo?: unknown;
}

export function parsePrtsRosterWikitext(wikitext: string, now: Date): PrtsOperator[] {
  const body = /<pre[^>]*>([\s\S]*?)<\/pre>/i.exec(wikitext)?.[1] ?? wikitext;
  const rows = parse(body, { columns: true, skip_empty_lines: true, trim: true }) as Array<Record<string, string>>;
  return rows.flatMap((row) => {
    const sortId = Number(row.sortId);
    const name = row.name?.trim();
    const releasedAt = shanghaiTimestamp(row.date ?? '');
    const timestamp = Date.parse(releasedAt);
    if (!Number.isSafeInteger(sortId) || sortId <= 0 || !name || Number.isNaN(timestamp) || timestamp > now.getTime()) {
      return [];
    }
    return [{ id: `prts:${sortId}` as const, sortId, name, releasedAt }];
  }).sort((left, right) => left.sortId - right.sortId);
}

export async function fetchPrtsRoster(client: MediaWikiClient, now: Date): Promise<PrtsOperator[]> {
  const response = await client.query<PrtsRosterResponse>({
    action: 'parse',
    page: '干员一览/干员id',
    prop: 'wikitext',
  });
  if (typeof response.parse?.wikitext !== 'string') throw new Error('PRTS roster response is missing parse.wikitext');
  return parsePrtsRosterWikitext(response.parse.wikitext, now);
}

export async function fetchPrtsAvatarUrls(
  client: MediaWikiClient,
  roster: readonly PrtsOperator[],
): Promise<Map<PrtsOperator['id'], string>> {
  const operatorsByTitle = new Map(roster.map((operator) => [normalizeFileTitle(`头像_${operator.name}.png`), operator]));
  const avatars = new Map<PrtsOperator['id'], string>();

  for (let offset = 0; offset < roster.length; offset += 50) {
    const batch = roster.slice(offset, offset + 50);
    const response = await client.query<PrtsImageInfoResponse>({
      action: 'query',
      prop: 'imageinfo',
      iiprop: 'url',
      iiurlwidth: '96',
      titles: batch.map((operator) => `File:头像_${operator.name}.png`).join('|'),
    });
    for (const page of pagesFrom(response)) {
      const operator = typeof page.title === 'string' ? operatorsByTitle.get(normalizeFileTitle(page.title)) : undefined;
      const imageInfo = Array.isArray(page.imageinfo) ? page.imageinfo[0] : undefined;
      if (!operator || !imageInfo || typeof imageInfo !== 'object') continue;
      const source = imageInfo as Record<string, unknown>;
      const url = typeof source.thumburl === 'string' ? source.thumburl : source.url;
      if (typeof url === 'string' && url) avatars.set(operator.id, url);
    }
  }

  return avatars;
}

function shanghaiTimestamp(value: string): string {
  const local = value.trim().replace(' ', 'T');
  if (!local) return '';
  return `${local.length === 16 ? `${local}:00` : local}+08:00`;
}

function normalizeFileTitle(value: string): string {
  return value.replace(/^(?:file|文件):/i, '').replaceAll('_', ' ').replace(/\s+/g, ' ').trim();
}

function pagesFrom(response: PrtsImageInfoResponse): ImagePage[] {
  const pages = response.query?.pages;
  if (Array.isArray(pages)) return pages as ImagePage[];
  if (pages && typeof pages === 'object') return Object.values(pages as Record<string, ImagePage>);
  return [];
}
