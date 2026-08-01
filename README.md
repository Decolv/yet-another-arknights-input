# arknights-name-input

一个可直接嵌入现有网站或小游戏的明日方舟干员名输入框 Web Component。创新点是支持英文输入的全拼，首拼，方便各种情况下的明日方舟角色名字输入。角色、别号和拼音索引全部打进单个 IIFE 文件，运行时不抓取角色表，不需要打包器、不需要框架、不需要 `type="module"`——只要往页面塞一个 `<script>` 和一个标签就能用。

## 1. 拿到脚本

嵌入方只需要一个 `arknights-name-input.js` 文件，不需要装 npm、跑构建，也不需要把整个仓库拖进你的项目。两种方式任选：

### 方式 A：直接从 Releases 下载（推荐）

每次发布都会自动构建并附带 `arknights-name-input.js` 和 `.js.map`：

- 下载页：<https://github.com/Decolv/yet-another-arknights-input/releases>
- 直链（替换 `v1.0.0` 为对应 tag）：
  ```
  https://github.com/Decolv/yet-another-arknights-input/releases/download/v1.0.0/arknights-name-input.js
  ```

把这个文件复制到你的项目里，例如 `/assets/arknights-name-input.js`。

### 方式 B：直接当 `<script src>` 引用 Release 直链

把上面的 release 直链直接塞进页面，连下载都省了：

```html
<script src="https://github.com/Decolv/yet-another-arknights-input/releases/download/v1.0.0/arknights-name-input.js"></script>
```

> GitHub Release 资产走标准 CDN，没有鉴权、不限速到影响小工具的程度。介意可用性可走方式 A 自托管。

### 方式 C：本地构建（想改源码或抓未发布版本再用）

仓库不提交构建产物。需要的话在本仓库目录跑：

```powershell
npm install
npm run build
```

得到 `dist/arknights-name-input.js`（以及同名 `.js.map`）。

## 2. 放进页面：一个脚本、一个标签

```html
<script src="/assets/arknights-name-input.js"></script>
<arknights-name-input
  id="operator"
  placeholder="输入干员名称、拼音或别号"
  max-results="8"
></arknights-name-input>
```

脚本执行后会自动注册 `<arknights-name-input>` 标签名，无需手动调用注册函数。输入「铃兰」「linglan」「ll」「zhongyue」都能命中对应干员。

## 3. 读取输入

两种取值方式，按你的集成深度挑一种。

### 提交时读文字（最简单）

只要一个字符串、自己判断对错：

```js
const operatorInput = document.querySelector('#operator');

function submitGuess() {
  const guess = operatorInput.value;   // 用户当前输入文字
  // 把 guess 交给你的业务逻辑
}
```

`value` 允许任意文字；只有当它精确等于某个干员的正式显示名时，只读属性 `valid` 才是 `true`。「提交」这件事完全由你控制，组件不会强制校验。

### 选定时拿稳定 ID 和头像（推荐）

需要稳定标识、头像或命中方式时，监听 `character-select`：

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
  id: 'prts:147',
  name: '铃兰',
  avatarUrl: 'https://media.prts.wiki/...',
  matchedBy: 'name-pinyin',
  matchedText: 'linglan'
}
```

> 时机区分：`character-select` 在用户用键盘/鼠标/触摸从候选中**选定**时派发；直接打字不会派发，想实时跟踪输入变化用 `input` 事件；程序设置 `.value` 或调用 `.clear()` 不会派发任何伪用户事件，可放心初始化/重置。`matchedBy` 的完整取值见 [`docs/api-reference.md`](docs/api-reference.md)。

## 4. 不同技术栈怎么挂

- **纯静态 HTML**：直接照第 2 节做。组件不是 form-associated custom element，`<form>` 原生提交不会自动带上组件值，需在 `submit` 监听里手动读取。
- **打包器（Webpack / Vite / Rollup）**：把 `dist/arknights-name-input.js` 当作普通静态资源处理，别 `import` 它（它是 IIFE，不是 ESM）。拷到 `public/` 目录、或用 `copy-webpack-plugin` / Vite `publicDir` 输出即可。
- **移动端 WebView / 混合 App**：组件已通过 Playwright 在 Pixel 7 Chromium 和 iPhone 15 WebKit 下验收触摸交互，通常直接套用。候选列表用 Shadow DOM 隔离样式，宿主全局 CSS 不互相污染。
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
- **Vue**：`<arknights-name-input @character-select="onSelect" placeholder="..." max-results="8" />`，当作原生元素对待。

## 5. 调成你的主题

组件把样式关在 Shadow DOM 里，宿主通过 CSS 变量调主题：

```css
arknights-name-input {
  --akni-width: 22rem;
  --akni-accent-color: #d59a24;   /* 换成你项目的主色 */
  --akni-radius: 4px;
  --akni-font-family: "YourGameFont", sans-serif;
}
```

完整变量表见 [`docs/api-reference.md`](docs/api-reference.md) 的「CSS 变量」一节。建议在组件外层套一个 `<div>` 控制布局位置，组件自身宽度由 `--akni-width` 管理。

## 6. 两个容易踩的坑

**坑 1：头像走 PRTS CDN，记得配 CSP。** 运行时角色表不联网，但当前可见候选的头像会从 `https://media.prts.wiki/...` 加载。如果你的页面有 Content Security Policy，把头像域名加进 `img-src`：

```
Content-Security-Policy: img-src 'self' https://media.prts.wiki
```

没配 CSP 就忽略这条。头像加载失败时组件会把该图片隐藏、文字候选仍可正常选择，不会因断图把整个输入搞坏。

**坑 2：别在捕获阶段、或挂在 `document` 上监听。** 组件在内部捕获原始 `input` 再重新派发稳定公共事件。把监听挂在祖先节点或 `document` 且用了捕获阶段，可能先看到 Shadow DOM 里的原始事件、跟公共事件不一致。统一做法：监听器挂在组件本身或冒泡阶段。

```js
// 推荐
operatorInput.addEventListener('character-select', handler);

// 不推荐：在 document 上捕获
document.addEventListener('input', handler, true);
```

## 7. 可直接抄的最小页面

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
        // 把 guess 交给你的业务逻辑
      });
    </script>
  </body>
</html>
```

## 8. 想再深入

- 完整属性、方法、事件、`matchedBy` 取值、CSS 变量表、头像网络行为、数据维护命令：[`docs/api-reference.md`](docs/api-reference.md)
- 组件实现细节：`src/component/arknights-name-input.ts`
- 数据快照格式：`data/operators.generated.json`

嵌入遇到问题，优先看 [`docs/api-reference.md`](docs/api-reference.md) 的「事件」和「头像和运行时网络」两节，覆盖了 90% 的集成疑问。
