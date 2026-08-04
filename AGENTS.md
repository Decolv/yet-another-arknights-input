# AGENTS.md

明日方舟干员名输入框 Web Component（`arknights-name-input`），打包成单文件 IIFE 供第三方嵌入网站/小游戏。运行时零请求（除头像 CDN），干员数据快照在构建时打进 bundle。

## 常用命令

```bash
npm run check          # 全量验证：typecheck + test + build，改完代码跑这个
npm run typecheck      # tsc --noEmit
npm test               # vitest run（单测）
npm run build          # esbuild 打包 IIFE → dist/arknights-name-input.js（+ sourcemap）
npm run demo           # 静态服务器 http://127.0.0.1:4173（服务 demo/index.html）
npm run test:e2e       # Playwright（5 个项目：chromium/firefox/webkit + Pixel 7 / iPhone 15）
npm run update-data    # 联网抓取数据 → 重写 data/operators.generated.json
npm run check-data     # 离线校验快照与拼音覆盖（不联网、不写文件）
```

- Node >= 22，ESM（`"type": "module"`），TS 脚本用 `tsx` 跑。
- **e2e 必须先 `npm run build`**：demo 页面引用 `./dist/arknights-name-input.js`，而 `dist/` 在 .gitignore 里，CI 和本地都不提交构建产物。playwright.config.ts 的 webServer 只起 demo 服务器，不构建。
- 改完代码建议 `npm run check`，与 CI 行为一致（CI 也是 typecheck → test → build 顺序）。

## 目录地图

- `src/index.ts` — 入口：校验数据快照（运行时断言 schema）、注册 `<arknights-name-input>` custom element
- `src/component/arknights-name-input.ts` — 组件本体（键盘/触摸交互、事件派发）
- `src/component/styles.ts` — Shadow DOM 样式字符串（组件 import 后塞进 style 标签）
- `src/search/` — 归一化 + 拼音搜索（全拼/首拼/别名）
- `src/data/` — 快照类型与 schema 断言
- `data/operators.generated.json` — **生成产物但提交进仓库**，构建时打进 bundle。改完数据源后必须重新生成并提交
- `data/pinyin-overrides.json` — 手工维护的拼音覆盖表，`update-data` 会校验其引用是否合法
- `scripts/` — `update-data.ts`（联网更新快照）、`check-data.ts`（离线校验）、`build.mjs`（esbuild）、`serve-static.ts`（demo 服务器）；`lib/` 下是按来源拆的数据抓取模块
- `tests/` — `component/`（jsdom）、`search/`、`data/`、`server/`、`updater/`、`e2e/`；`fixtures/` 有 PRTS/Moegirl API 快照（生成物，抓取逻辑变了要同步）和 `operators.ts`（手写测试数据，改它等于改断言基线）
- `docs/api-reference.md` — 面向嵌入方的完整接口手册（属性/事件/CSS 变量/数据维护命令）
- `docs/superpowers/` — 历史设计 spec 与 plan，改架构前可参考

## 数据维护

```bash
npm run update-data -- --dry-run     # 只预览差异，不写文件
npm run update-data                  # 抓 PRTS roster + 头像 + Moegirl 别名 → 重写快照
npm run update-data -- --accept-removal=prts:123   # 确认某个干员被移除
```

- 数据来源：PRTS wiki（角色表+头像）+ Moegirl（别名），HTTP 响应缓存在 `.cache/`（已 gitignored）。
- 干员移除默认会被拒绝，必须显式 `--accept-removal=prts:<id>` 确认；`--now=<ISO 时间>` 可固定时间做确定性重放。
- **`update-data` 很慢（实测 5-10 分钟）**：要逐个抓取每个干员的 Moegirl 渲染页面（427 个页面 × 250ms 限速），跑之前给足超时。个别页面 30s 请求超时是正常的，只报 warning 不中断；`[csstree-match] BREAK after 15000 iterations` 是解析渲染页面的正常防御输出，不是错误。
- **有缓存也不是离线**：缓存命中时脚本仍会发 `If-None-Match`/`If-Modified-Since` 条件请求等服务器响应（304 走缓存），网络不通时 `update-data` 照样会慢/失败；真正离线的校验是 `check-data`。
- `check-data` 要求快照 ≥100 个干员、schema 合法、拼音覆盖都能对上，跑在 `update-data` 之后。
- 新干员（新增角色）不需要特殊确认，正常 diff 即可；diff 里的 `aliasCollisions`（同一别名属多个干员）只是 warning，不阻断写入。

## 测试注意

- vitest 全局默认 node 环境；**组件测试用 `// @vitest-environment jsdom` 注释声明**，别在 vitest.config.ts 里全局开 jsdom。
- `tests/updater/` 的测试读 `tests/fixtures/` 里的 API 快照，不真联网；改 `scripts/lib/` 抓取逻辑后若行为变了，fixtures 也要同步更新。
- e2e 有 `@touch` 标记的测试只在 mobile 项目跑，桌面三浏览器会 grep 掉。

## 文档约定（重要）

- **README.md 面向嵌入方开发者**：只做简介 + 嵌入方式 + 常见坑，不写开发手册。详细文档一律进 `docs/` 独立文件。
- 改公开接口（属性/事件/CSS 变量）时同步更新 `docs/api-reference.md`。
- README 和 api-reference 的职责边界：README 是"怎么嵌入"，api-reference 是"完整接口清单"。

## 工程约定与坑

- 组件是 **IIFE 不是 ESM**：嵌入方当静态资源 `<script>` 引入，不 `import`。`src/index.ts` 里 `customElements.define` 会自执行注册，无需调用者手动注册。
- `event.detail` 的 `matchedBy` 值（`name` / `name-pinyin` / `alias` …）是公共契约，改动要同步 README + api-reference + 测试。
- tsconfig 开了 `noUncheckedIndexedAccess` 和 `exactOptionalPropertyTypes`，写数组取值和可选属性时注意非空处理。
- 默认分支是 `master`；push master 触发 Pages 部署 demo，打 `v*` tag 触发构建 + 生成 Release 资产（含 `sri.txt` SRI 校验值，README 引用了它）。
- commit message 风格：中文 conventional commits（`feat:` / `fix:` / `docs:` / `ci:` / `test:`）。
