import { expect, it, vi } from 'vitest';
import imageInfoResponse from '../fixtures/prts-imageinfo-api.json';
import rosterResponse from '../fixtures/prts-roster-api.json';
import {
  fetchPrtsAvatarUrls,
  fetchPrtsRoster,
  parsePrtsRosterWikitext,
  type PrtsOperator,
} from '../../scripts/lib/prts.js';

const releasedNow = new Date('2026-07-31T12:00:00+08:00');

it('keeps released positive sortIds and constructs stable IDs', () => {
  const rows = parsePrtsRosterWikitext(rosterResponse.parse.wikitext, releasedNow);

  expect(rows.map((row) => row.id)).toEqual(['prts:147', 'prts:268', 'prts:352']);
  expect(rows.some((row) => row.name === '预备干员-近战')).toBe(false);
  expect(rows.some((row) => row.name === '予愿安洁莉娜')).toBe(false);
});

it('requests the PRTS roster wikitext through the parse API', async () => {
  const query = vi.fn().mockResolvedValue(rosterResponse);

  const roster = await fetchPrtsRoster({ query } as never, releasedNow);

  expect(roster.map((operator) => operator.id)).toEqual(['prts:147', 'prts:268', 'prts:352']);
  expect(query).toHaveBeenCalledWith({
    action: 'parse', page: '干员一览/干员id', prop: 'wikitext',
  });
});

it('resolves normalized avatar titles in batches of fifty', async () => {
  const roster: PrtsOperator[] = Array.from({ length: 51 }, (_, index) => ({
    id: `prts:${index + 1}` as const,
    sortId: index + 1,
    name: index === 0 ? '铃兰' : index === 1 ? '重岳' : index === 2 ? '忍冬' : `干员${index + 1}`,
    releasedAt: '2020-01-01T00:00:00+08:00',
  }));
  const query = vi.fn().mockResolvedValue(imageInfoResponse);

  const avatars = await fetchPrtsAvatarUrls({ query } as never, roster);

  expect(query).toHaveBeenCalledTimes(2);
  expect(query.mock.calls[0]?.[0]).toMatchObject({
    action: 'query', prop: 'imageinfo', iiprop: 'url', iiurlwidth: '96',
  });
  expect(query.mock.calls[0]?.[0].titles.split('|')).toHaveLength(50);
  expect(query.mock.calls[1]?.[0].titles).toBe('File:头像_干员51.png');
  expect(avatars).toEqual(new Map([
    ['prts:1', 'https://prts.wiki/images/thumb-linglan.png'],
    ['prts:2', 'https://prts.wiki/images/thumb-chongyue.png'],
    ['prts:3', 'https://prts.wiki/images/rendong.png'],
  ]));
});
