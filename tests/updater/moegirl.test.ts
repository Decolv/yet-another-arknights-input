import { expect, it, vi } from 'vitest';
import revisionsResponse from '../fixtures/moegirl-revisions-api.json';
import { fetchMoegirlAliases, parseMoegirlAliases } from '../../scripts/lib/moegirl.js';

it('extracts only a top-level 别号 field and removes its markup', () => {
  const wikitext = `{{干员信息\n|别号=[[目标|标签]]<ref>source</ref><br/>乙、丙，丁；戊/己\n|梗=绝不能采集\n}}\n正文别号=也不能采集`;

  expect(parseMoegirlAliases(wikitext)).toEqual(['标签', '乙', '丙', '丁', '戊', '己']);
});

it('collects aliases by requested official name with redirects and explicit data-quality warnings', async () => {
  const query = vi.fn().mockResolvedValue(revisionsResponse);

  const result = await fetchMoegirlAliases({ query } as never, ['忍冬', '重岳（明日方舟）', '铃兰', '缺页']);

  expect(query).toHaveBeenCalledWith({
    action: 'query',
    prop: 'revisions',
    rvslots: 'main',
    rvprop: 'content',
    redirects: '1',
    titles: '忍冬|重岳（明日方舟）|铃兰|缺页',
  });
  expect(result.aliasesByName).toEqual(new Map([
    ['忍冬', ['铃兰妈']],
    ['重岳（明日方舟）', ['大哥', '老陈', '陈sir']],
  ]));
  expect(result.warnings).toEqual([
    'Moegirl page 铃兰 has an empty 别号 field',
    'Moegirl page 缺页 is missing',
  ]);
});

it('uses batches of fifty and warns instead of accepting unexpanded templates', async () => {
  const names = Array.from({ length: 51 }, (_, index) => `干员${index + 1}`);
  const query = vi.fn().mockResolvedValue({
    query: { pages: [{ title: '干员1', revisions: [{ slots: { main: { content: '|别号={{未展开}}' } } }] }] },
  });

  const result = await fetchMoegirlAliases({ query } as never, names);

  expect(query).toHaveBeenCalledTimes(2);
  expect(query.mock.calls[0]?.[0].titles.split('|')).toHaveLength(50);
  expect(query.mock.calls[1]?.[0].titles).toBe('干员51');
  expect(result.aliasesByName.size).toBe(0);
  expect(result.warnings).toEqual(['Moegirl page 干员1 has an unexpanded 别号 template']);
});

it('keeps multiline nested templates and refs inside 别号 until the real next field', async () => {
  const nestedTemplate = `{{干员信息
|别号={{别名模板
|参数=不能截断
}}
|职业=近卫
}}`;
  const multilineRef = `{{干员信息
|别号=甲<ref name="source">
|引用参数=不是字段
</ref>、乙
|职业=近卫
}}`;
  const query = vi.fn().mockResolvedValue({
    query: { pages: [
      { title: '模板干员', revisions: [{ slots: { main: { content: nestedTemplate } } }] },
      { title: '引文干员', revisions: [{ slots: { main: { content: multilineRef } } }] },
    ] },
  });

  const result = await fetchMoegirlAliases({ query } as never, ['模板干员', '引文干员']);

  expect(parseMoegirlAliases(multilineRef)).toEqual(['甲', '乙']);
  expect(result.aliasesByName).toEqual(new Map([['引文干员', ['甲', '乙']]]));
  expect(result.warnings).toEqual(['Moegirl page 模板干员 has an unexpanded 别号 template']);
});
