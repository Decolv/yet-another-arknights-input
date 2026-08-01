import { expect, it, vi } from 'vitest';
import revisionsResponse from '../fixtures/moegirl-revisions-api.json';
import {
  fetchMoegirlAliases,
  fetchMoegirlRenderedAliases,
  parseMoegirlAliases,
} from '../../scripts/lib/moegirl.js';

it('extracts only a top-level 别号 field and removes its markup', () => {
  const wikitext = `{{干员信息\n|别号=[[目标|标签]]<ref>source</ref><br/>乙、丙，丁；戊/己\n|梗=绝不能采集\n}}\n正文别号=也不能采集`;

  expect(parseMoegirlAliases(wikitext)).toEqual(['标签', '乙', '丙', '丁', '戊', '己']);
});

it('collects aliases by requested official name with redirects and explicit data-quality warnings', async () => {
  const query = vi.fn().mockResolvedValue(revisionsResponse);

  const result = await fetchMoegirlAliases({ query } as never, ['忍冬', '重岳（明日方舟）', '铃兰', '缺页']);

  expect(query).toHaveBeenCalledWith({
    action: 'query',
    origin: '*',
    prop: 'revisions',
    rvslots: 'main',
    rvprop: 'content',
    redirects: '1',
    titles: '忍冬|重岳（明日方舟）|铃兰|缺页',
  });
  expect(result.aliasesByName).toEqual(new Map([
    ['忍冬', ['冬妈']],
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

it('extracts aliases only from the rendered 别号 row nickname element', async () => {
  const fetchRenderedPage = vi.fn(async (name: string) => ({
    忍冬: `<table class="infotemplatebox"><tr><th>别号</th><td><span itemprop="nickname">冬妈、<s>角峰p</s><sup class="reference"><a><span class="cite-bracket">[</span>1<span class="cite-bracket">]</span></a></sup></span></td></tr></table>
      <p>正文里的忍冬妈绝不能采集</p>`,
    铃兰: '<table class="infotemplatebox"><tr><th>别号</th><td>正文称作小狐狸，但没有 nickname 标记</td></tr></table>',
  })[name]!);

  const result = await fetchMoegirlRenderedAliases({ fetchRenderedPage }, ['忍冬', '铃兰']);

  expect(fetchRenderedPage).toHaveBeenCalledTimes(2);
  expect(result.aliasesByName).toEqual(new Map([['忍冬', ['冬妈', '角峰p']]]));
  expect(result.warnings).toEqual(['Moegirl page 铃兰 has an empty 别号 field']);
});

it('ignores a fake 别号 row outside the official character information box', async () => {
  const fetchRenderedPage = vi.fn(async () => `
    <table><tr><th>别号</th><td><span itemprop="nickname">正文伪值</span></td></tr></table>
    <table class="infotemplatebox"><tr><th>性别</th><td>女</td></tr></table>
  `);

  const result = await fetchMoegirlRenderedAliases({ fetchRenderedPage }, ['忍冬']);

  expect(result.aliasesByName.size).toBe(0);
  expect(result.warnings).toEqual(['Moegirl page 忍冬 has no 别号 field']);
});

it('warns explicitly when an official rendered page or its 别号 field is unavailable', async () => {
  const fetchRenderedPage = vi.fn(async (name: string) => {
    if (name === '缺页') throw new Error('HTTP 404 Not Found');
    if (name === '失败') throw new Error('HTTP 503 Service Unavailable');
    return '<table><tr><th>性别</th><td>女</td></tr></table>';
  });

  await expect(fetchMoegirlRenderedAliases(
    { fetchRenderedPage },
    ['缺页', '失败', '缺字段'],
  )).rejects.toThrow(/Moegirl rendered page failures.*失败.*HTTP 503 Service Unavailable/s);
  expect(fetchRenderedPage).toHaveBeenCalledTimes(3);
});

it('processes every rendered page with two bounded in-flight requests', async () => {
  let inFlight = 0;
  let peakInFlight = 0;
  const fetchRenderedPage = vi.fn(async (name: string) => {
    inFlight += 1;
    peakInFlight = Math.max(peakInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight -= 1;
    if (name === '干员4') throw new Error('HTTP 403 Forbidden');
    return '<table class="infotemplatebox"><tr><th>别号</th><td><span itemprop="nickname">别号</span></td></tr></table>';
  });
  const names = Array.from({ length: 6 }, (_, index) => `干员${index + 1}`);

  await expect(fetchMoegirlRenderedAliases({ fetchRenderedPage }, names))
    .rejects.toThrow(/Moegirl rendered page failures.*干员4.*HTTP 403 Forbidden/s);

  expect(fetchRenderedPage).toHaveBeenCalledTimes(6);
  expect(peakInFlight).toBe(2);
});
