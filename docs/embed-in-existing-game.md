# 把组件快速嵌入已有小游戏

这份指南面向「我已经有一个跑着的小游戏，想把干员名输入框塞进去」的场景，目标是 30 秒跑通最小可用，再按需扩展。完整的属性、事件和 CSS 变量参考根目录 `README.md`。

---

## 0. 一句话背景

`arknights-name-input` 是一个**纯浏览器 Web Component**：所有干员、别号、拼音索引都打进单个 IIFE 文件，运行时不调用 PRTS 或萌娘百科 API，不需要打包器、不需要框架、不需要 `type="module"`。只要能往页面塞一个 `<script>` 和一个标签，就能用。

---

## 1. 最小嵌入：三个改动

### 改动 1：拿到脚本文件

仓库没把构建产物提交进 git。在本仓库目录跑一次：

```powershell
npm install
npm run build
```

得到 `dist/arknights-name-input.js`（以及同名 `.js.map`）。把这个文件**复制到你的游戏项目**里，比如 `/assets/arknights-name-input.js`。

> 构建产物不提交是本仓库的约定；嵌入方只需要这个 `.js` 文件，不需要把整个仓库拖进游戏项目。

### 改动 2：在页面里加载脚本

```html
<script src="/assets/arknights-name-input.js"></script>
```

放在 `</head>` 前、或任何你通常加载公共脚本的位置都行。脚本执行后会**自动注册** `<arknights-name-input>` 这个标签名——无需手动调用注册函数。

### 改动 3：在需要输入的地方放标签

```html
<arknights-name-input
  id="operator"
  placeholder="输入干员名称、拼音或别号"
  max-results="8"
></arknights-name-input>
```

就这三步。组件已经能用了：输入「铃兰」「linglan」「ll」「铃兰妈」都能找到对应干员。

---

## 2. 读值：从组件拿到游戏要的东西

小游戏集成通常只要「提交时读输入值」或「选定一个干员时拿到稳定 ID」。两种都给最小代码。

### 提交时读文字（最简单）

如果你的游戏逻辑只要一个字符串、自己判断对错：

```js
const operatorInput = document.querySelector('#operator');

function submitGuess() {
  const guess = operatorInput.value;   // 用户当前输入文字
  // 把 guess 交给已有游戏逻辑
}
```

`value` 是字符串，允许任意文字。只有当 `value` 精确等于某个干员的正式显示名时，只读属性 `valid` 才是 `true`——但「提交」这件事完全由你的游戏控制，组件不会强制校验。

### 选定时拿稳定 ID 和头像（推荐）

如果你的游戏需要稳定标识、头像或命中方式，监听 `character-select`：

```js
const operatorInput = document.querySelector('#operator');

operatorInput.addEventListener('character-select', (event) => {
  const { id, name, avatarUrl, matchedBy, matchedText } = event.detail;
  // id 形如 'prts:352'，跨数据更新稳定
  // name 是正式显示名，avatarUrl 是 PRTS 头像直链
  // matchedBy 告诉你命中了哪个字段（name / name-pinyin / alias / ...）
  // matchedText 是实际命中文字，方便做高亮或日志
  game.onOperatorPicked(id, name, avatarUrl);
});
```

典型 `event.detail`：

```js
{
  id: 'prts:352',
  name: '忍冬',
  avatarUrl: 'https://media.prts.wiki/...',
  matchedBy: 'alias-pinyin',
  matchedText: '铃兰妈'
}
```

> 注意区分两个时机：
> - `character-select` 用户**用键盘/鼠标/触摸从候选中选定**时派发。
> - 直接打字不会派发它；想实时跟踪输入变化用 `input` 事件。
> - 程序设置 `.value` 或调用 `.clear()` **不会**派发任何伪用户事件，可放心初始化/重置。

---

## 3. 常见宿主形态

### A. 纯静态 HTML 小游戏

直接照第 1 节三改动做。提交表单时读 `.value` 即可。组件不是 form-associated custom element，所以 `<form>` 原生提交不会自动带上组件值——需要你在 `submit` 监听里手动读取。

### B. 用打包器（Webpack / Vite / Rollup）的游戏

把 `dist/arknights-name-input.js` 当作**普通静态资源**处理，别 `import` 它。两种放法：

1. 复制到 `public/` 或等价的静态目录，HTML 模板里加 `<script src>`。
2. 用打包器的静态资源拷贝插件（如 `copy-webpack-plugin`、Vite 的 `publicDir`）一并输出。

不要走 `import` 路径——它是 IIFE，不是 ESM，挂载方式是侧效应注册标签。

### C. 移动端 WebView / 混合 App

组件已通过 Playwright 在 Pixel 7 Chromium 和 iPhone 15 WebKit 项目下验收过触摸交互。WebView 里通常直接套用即可，留意两点：

- WebView 关闭了 JS 就用不了，这是前提。
- 候选列表用 Shadow DOM 隔离样式，宿主页面的全局 CSS 不会漏进去，也不会渗出去——你给游戏写的样式不会被组件污染。

### D. React / Vue 等框架宿主

Web Component 在这些框架里当作普通 DOM 元素使用即可：

- **React**（≥19 直接支持 custom element；较早版本给 ref 手动设属性）：
  ```jsx
  function OperatorPicker() {
    const ref = useRef();
    useEffect(() => {
      const el = ref.current;
      if (!el) return;
      const onSelect = (e) => game.onOperatorPicked(e.detail.id, e.detail.name);
      el.addEventListener('character-select', onSelect);
      return () => el.removeEventListener('character-select', onSelect);
    }, []);
    return <arknights-name-input ref={ref} placeholder="输入干员" max-results="8" />;
  }
  ```
- **Vue**：`<arknights-name-input @character-select="onSelect" placeholder="..." max-results="8" />`，组件当作原生元素对待。

---

## 4. 主题适配：让组件看起来像你的游戏

组件把内部样式关在 Shadow DOM 里，宿主通过 CSS 变量调主题，不会冲突。最小例子：

```css
arknights-name-input {
  --akni-width: 22rem;
  --akni-accent-color: #d59a24;   /* 换成你游戏的主色 */
  --akni-radius: 4px;
  --akni-font-family: "YourGameFont", sans-serif;
}
```

完整变量表见 `README.md` 的「CSS 变量」一节。建议在组件外层用一个 `<div>` 包住并控制布局位置，组件自身宽度由 `--akni-width` 管理。

---

## 5. 两个容易踩的坑

### 坑 1：头像走 PRTS CDN，记得配 CSP

运行时角色表不联网，但**当前可见候选的头像**会从 `https://media.prts.wiki/...` 加载。如果你的游戏页有 Content Security Policy，记得把头像域名加进 `img-src`：

```
Content-Security-Policy: img-src 'self' https://media.prts.wiki
```

没配 CSP 就忽略这条。头像加载失败时，组件会把那张图片隐藏、文字候选仍可正常选择——不会因为断图把整个输入搞坏。

### 坑 2：别在捕获阶段、或挂在 `document` 上监听

组件在内部捕获原始 `input` 再重新派发稳定的公共事件。如果你把监听挂在祖先节点或 `document` 且用了**捕获阶段**，可能先看到 Shadow DOM 里的原始事件，跟公共事件不一致。统一做法：**监听器挂在组件本身（或冒泡阶段）**，听 `character-select` / `input` 即可。

```js
// 推荐
operatorInput.addEventListener('character-select', handler);

// 不推荐：在 document 上捕获
document.addEventListener('input', handler, true);
```

---

## 6. 一份可直接抄的最小页面

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>干员名输入 · 嵌入示例</title>
    <script src="/assets/arknights-name-input.js"></script>
    <style>
      arknights-name-input {
        --akni-width: 20rem;
        --akni-accent-color: #d59a24;
      }
    </style>
  </head>
  <body>
    <arknights-name-input
      id="operator"
      placeholder="输入干员名称、拼音或别号"
      max-results="8"
    ></arknights-name-input>
    <button id="submit">提交</button>
    <pre id="output">尚未选择</pre>

    <script>
      const input = document.querySelector('#operator');

      // 选定候选时立刻拿到稳定 ID
      input.addEventListener('character-select', (e) => {
        document.querySelector('#output').textContent =
          `${e.detail.id} · ${e.detail.name}`;
      });

      // 提交按钮读当前输入值
      document.querySelector('#submit').addEventListener('click', () => {
        const guess = input.value;
        // 把 guess 交给已有游戏逻辑
      });
    </script>
  </body>
</html>
```

跑起来后输入「linglan」「ll」「铃兰妈」「zhongyue」试试，能直观看到命中行为。

---

## 7. 想再深入

- 完整属性、方法、事件、CSS 变量表：根目录 `README.md`
- 数据是怎么生成、怎么更新的：`README.md` 的「数据维护和验证」
- 组件实现细节：`src/component/arknights-name-input.ts`
- 数据快照格式：`data/operators.generated.json`

嵌入遇到问题，优先看 `README.md` 的「公共接口」和「头像和运行时网络」两节，那两节覆盖了 90% 的集成疑问。