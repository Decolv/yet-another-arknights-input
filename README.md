# arknights-name-input

一个可直接嵌入现有小游戏或普通网页的明日方舟干员名输入 Web Component。运行时角色、别号和拼音索引已打进单个 IIFE 文件；浏览器不会抓取角色表或别号数据。

## 快速开始：一个脚本、一个标签

先运行 `npm run build`，再把 `dist/arknights-name-input.js` 与页面一同发布：

```html
<script src="/assets/arknights-name-input.js"></script>
<arknights-name-input
  id="operator"
  placeholder="输入干员名称、拼音或别号"
  max-results="8"
></arknights-name-input>
```

脚本是普通的浏览器 IIFE，不需要 `type="module"`、打包器或额外运行时依赖。标签注册名固定为 `arknights-name-input`。

最简单的小游戏宿主只需在提交时读取 `.value`：

```js
const operatorInput = document.querySelector('#operator');

function submitGuess() {
  const guess = operatorInput.value;
  // 用 guess 进入已有游戏逻辑。
}
```

如果宿主需要稳定 ID、头像或命中方式，或者想调整主题样式，详细接口和数据维护命令见下列文档：

- [`docs/embed-in-existing-game.md`](docs/embed-in-existing-game.md) — 把组件一步步嵌入已有小游戏的接入手册，含取值、宿主形态、踩坑提示和可直接抄的最小页面。
- [`docs/api-reference.md`](docs/api-reference.md) — 完整属性、方法、事件、CSS 变量、头像网络行为、数据维护和多音字 override。

## 数据来源与使用说明

- 干员名单、稳定排序 ID 和头像 URL：[PRTS 干员一览/干员id](https://prts.wiki/w/干员一览/干员id)
- 每角色"别号"字段：[萌娘百科](https://mzh.moegirl.org.cn/)
- 快照生成时间记录在 `data/operators.generated.json` 顶层的 `generatedAt` 字段；当前提交快照为 `2026-07-31T07:01:26.312Z`。

在重新分发生成数据或发布含来源内容的产物前，请重新核对 PRTS、萌娘百科及相关媒体文件当时有效的使用、署名和再分发条款；本项目不假定站点条款永久不变。

## 首版明确不包含

- NPC 和敌人。
- 职业、稀有度或星级展示。
- 模糊拼写纠错。
- 全量头像预加载或头像打包。