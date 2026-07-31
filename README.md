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

如果宿主需要稳定 ID、头像或命中方式，监听选择事件：

```js
const operatorInput = document.querySelector('#operator');

operatorInput.addEventListener('character-select', (event) => {
  const { id, name, avatarUrl, matchedBy, matchedText } = event.detail;
  console.log(id, name, avatarUrl, matchedBy, matchedText);
});
```

## 公共接口

### 属性

| HTML 属性 | JavaScript 属性 | 类型 | 说明 |
| --- | --- | --- | --- |
| `value` | `value` | `string` | 当前输入文字，可读写 |
| `placeholder` | `placeholder` | `string` | 内部输入框占位文字 |
| `disabled` | `disabled` | `boolean` | 禁用输入 |
| `max-results` | `maxResults` | `number` | 最多显示候选数，默认 8，必须为正整数 |

只读属性：

| JavaScript 属性 | 类型 | 说明 |
| --- | --- | --- |
| `valid` | `boolean` | `value` 精确等于正式显示名时为 `true` |
| `selectedCharacter` | `{ id, name, avatarUrl } \| null` | 精确正式名对应的角色；否则为 `null` |

组件允许自由文本。输入拼音、别号、错名或未知文字时 `.value` 会原样保留，但只有精确正式名才令 `.valid === true`。直接完整输入正式名会更新 `valid` 与 `selectedCharacter`，不会伪造一次选择事件。

### 方法

| 方法 | 说明 |
| --- | --- |
| `focus(options?)` | 聚焦内部输入框 |
| `clear()` | 清空文字、有效选择和候选列表 |

程序设置 `value` 或调用 `clear()` 不会派发伪造的用户 `input` 或 `character-select` 事件。首个版本不是 form-associated custom element；表单或游戏状态应读取 `.value`，或通过下述事件同步。

### 事件

| 事件 | 说明 |
| --- | --- |
| `input` | 用户提交一次文字变化后派发；可冒泡且 `composed: true` |
| `character-select` | 用户用键盘、鼠标或触摸选定候选后派发；可冒泡且 `composed: true` |

`character-select` 的 `event.detail`：

```js
{
  id: 'prts:352',
  name: '忍冬',
  avatarUrl: 'https://media.prts.wiki/...',
  matchedBy: 'alias-pinyin',
  matchedText: '铃兰妈'
}
```

`matchedBy` 是以下稳定值之一：

| 值 | 命中字段 |
| --- | --- |
| `name` | 正式名 |
| `name-pinyin` | 正式名主拼音 |
| `name-pinyin-alt` | 正式名备用读音 |
| `name-initials` | 正式名主拼音首字母 |
| `name-initials-alt` | 正式名备用读音首字母 |
| `alias` | 别号 |
| `alias-pinyin` | 别号主拼音 |
| `alias-pinyin-alt` | 别号备用读音 |
| `alias-initials` | 别号主拼音首字母 |
| `alias-initials-alt` | 别号备用读音首字母 |

建议把用户事件监听器挂在组件本身或使用普通冒泡监听。组件会在内部捕获原始 `input` 并重新派发稳定的公共事件；祖先或 `document` 上的捕获阶段监听器可能先看到 Shadow DOM 原始事件，不适合作为唯一集成点。

### CSS 变量

Shadow DOM 隔离内部结构；宿主通过以下变量调整主题：

| CSS 变量 | 说明 |
| --- | --- |
| `--akni-width` | 组件宽度 |
| `--akni-font-family` | 字体族 |
| `--akni-font-size` | 基础字号 |
| `--akni-text-color` | 文本颜色 |
| `--akni-background` | 输入框和列表背景 |
| `--akni-border-color` | 边框颜色 |
| `--akni-accent-color` | 高亮和焦点颜色 |
| `--akni-radius` | 圆角 |
| `--akni-input-height` | 输入框高度 |
| `--akni-option-height` | 候选项最小高度 |
| `--akni-list-max-height` | 候选列表最大高度 |
| `--akni-z-index` | 候选列表层级 |

```css
arknights-name-input {
  --akni-width: 20rem;
  --akni-accent-color: #d59a24;
}
```

## 头像和运行时网络

角色表、别号和检索索引位于 IIFE 内，运行时不会调用 PRTS 或萌娘百科 API。只有当前可见候选的头像会从其 `https://media.prts.wiki/...` URL 加载；组件不会预加载全部头像。头像被拦截、离线或加载失败时，该图片会隐藏，文字候选仍可键盘、鼠标和触摸选择。部署时请据此配置 CSP 的 `img-src`。

## 数据维护和验证

```powershell
npm run update-data
npm run check-data
npm run typecheck
npm test
npm run build
npm run test:e2e
```

- `update-data` 从来源更新并验证快照；这是维护命令，不在浏览器运行。
- `check-data` 检查已提交快照和拼音覆盖目标。
- `build` 生成 `dist/arknights-name-input.js` 及 source map。
- `test:e2e` 在 Chromium、Firefox、WebKit、Pixel 7 Chromium 和 iPhone 15 WebKit 项目中运行；首次使用前可执行 `npx playwright install chromium firefox webkit`。

多音字通过 `data/pinyin-overrides.json` 按稳定 PRTS ID 维护。例如重岳：

```json
{
  "prts:268": {
    "name": {
      "primary": {
        "pinyin": "chongyue",
        "initials": "cy"
      },
      "alternates": [
        {
          "pinyin": "zhongyue",
          "initials": "zy"
        }
      ]
    },
    "aliases": {}
  }
}
```

## 数据来源与使用说明

- 干员名单、稳定排序 ID 和头像 URL：[PRTS 干员一览/干员id](https://prts.wiki/w/干员一览/干员id)
- 每角色“别号”字段：[萌娘百科](https://mzh.moegirl.org.cn/)
- 快照生成时间记录在 `data/operators.generated.json` 顶层的 `generatedAt` 字段；当前提交快照为 `2026-07-31T07:01:26.312Z`。

在重新分发生成数据或发布含来源内容的产物前，请重新核对 PRTS、萌娘百科及相关媒体文件当时有效的使用、署名和再分发条款；本项目不假定站点条款永久不变。

## 首版明确不包含

- NPC 和敌人。
- 职业、稀有度或星级展示。
- 模糊拼写纠错。
- 全量头像预加载或头像打包。
