# arknights-name-input 接口手册

这份手册给出组件的完整公共接口、CSS 变量、头像网络行为和数据维护命令，供需要逐项核对接口或做数据维护的开发者查阅。想直接把组件嵌入你的网站或小游戏，按步走请看根目录 [`README.md`](../README.md)——它是面向嵌入方的完整接入手册。

---

## 属性

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

程序设置 `value` 或调用 `clear()` 不会派发伪造的用户 `input` 或 `character-select` 事件。首版不是 form-associated custom element；表单或游戏状态应读取 `.value`，或通过下述事件同步。

---

## 事件

| 事件 | 说明 |
| --- | --- |
| `input` | 用户提交一次文字变化后派发；可冒泡且 `composed: true` |
| `character-select` | 用户用键盘、鼠标或触摸选定候选后派发；可冒泡且 `composed: true` |

`character-select` 的 `event.detail`：

```js
{
  id: 'prts:147',
  name: '铃兰',
  avatarUrl: 'https://media.prts.wiki/...',
  matchedBy: 'name-pinyin',
  matchedText: 'linglan'
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

---

## CSS 变量

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

---

## 头像和运行时网络

角色表、别号和检索索引位于 IIFE 内，运行时不会调用 PRTS 或萌娘百科 API。只有当前可见候选的头像会从其 `https://media.prts.wiki/...` URL 加载；组件不会预加载全部头像。头像被拦截、离线或加载失败时，该图片会隐藏，文字候选仍可键盘、鼠标和触摸选择。部署时请据此配置 CSP 的 `img-src`。

---

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

首字母索引使用无声调的拼音音节首字符。独立的 `er` 音节会同时生成 `e` 和 `r` 两种首字母形式，例如"史尔特尔"既可输入 `sete`，也可输入 `srtr`。规范化采用 NFKD 分解并剥离所有组合标记（含拼音声调），因此人工拼音 override 中可保留声调，搜索时会被一致地无声调化。