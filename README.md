# 明日方舟干员名输入框

一个可以嵌入网页的明日方舟干员输入组件，支持拼音搜索。

**在线试试**：https://decolv.github.io/yet-another-arknights-input/

> **⚠️ 重要提示：请使用英文输入法输入拼音**  
> 拼音搜索功能需要英文输入法才能正常工作。使用中文输入法时，字母会被输入法提前转换成汉字，导致拼音匹配失效。

## 特点

- 🔍 支持中文、全拼、首拼、混合拼写搜索（铃兰 / linglan / ll / lingl / llan）
- 📦 单文件引入，不需要 npm 或打包工具
- 🎨 可自定义主题颜色
- 📱 支持键盘、鼠标、触摸操作
- 🖼️ 自动显示干员头像

## 快速开始

### 1. 下载文件

去 [Releases 页面](https://github.com/Decolv/yet-another-arknights-input/releases) 下载最新的 `arknights-name-input.js`，放到你的项目里。

### 2. 在 HTML 里引入

```html
<script src="arknights-name-input.js"></script>
<arknights-name-input placeholder="输入干员名称"></arknights-name-input>
```

就这么简单！

### 3. 获取用户选择的干员

```html
<script>
  const input = document.querySelector('arknights-name-input');
  
  input.addEventListener('character-select', (e) => {
    console.log('用户选了：', e.detail.name);  // 例如：铃兰
    console.log('干员 ID：', e.detail.id);      // 例如：prts:147
    console.log('头像地址：', e.detail.avatarUrl);
  });
</script>
```

## 完整示例

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>干员输入示例</title>
  <script src="arknights-name-input.js"></script>
</head>
<body>
  <h1>猜猜这是哪个干员？</h1>
  
  <arknights-name-input 
    id="operator"
    placeholder="输入干员名称或拼音"
    max-results="8">
  </arknights-name-input>
  
  <button id="submit">提交答案</button>
  <p id="result"></p>

  <script>
    const input = document.querySelector('#operator');
    const result = document.querySelector('#result');
    
    // 用户从下拉列表选择时
    input.addEventListener('character-select', (e) => {
      result.textContent = `你选择了：${e.detail.name}`;
    });
    
    // 点击提交按钮时
    document.querySelector('#submit').addEventListener('click', () => {
      const answer = input.value;
      result.textContent = `你输入了：${answer}`;
    });
  </script>
</body>
</html>
```

## 自定义样式

用 CSS 变量改颜色：

```html
<style>
  arknights-name-input {
    --akni-width: 20rem;              /* 宽度 */
    --akni-accent-color: #d59a24;     /* 高亮颜色 */
    --akni-font-size: 16px;           /* 字体大小 */
    --akni-radius: 8px;               /* 圆角 */
  }
</style>
```

## 可用属性

| 属性 | 说明 | 默认值 |
|------|------|--------|
| `placeholder` | 输入框提示文字 | 空 |
| `max-results` | 最多显示几个候选 | 8 |
| `disabled` | 是否禁用 | false |
| `value` | 当前输入的文字 | 空 |

## 常见问题

**Q: 为什么拼音搜索不工作？**  
A: **必须使用英文输入法输入拼音。** 中文输入法会把字母提前转成汉字，例如输入 `ll` 会变成「了了」，导致拼音匹配失效。切换到英文输入法（通常按 Shift 键切换）后再输入拼音即可。

**Q: 可以用在 React/Vue 里吗？**  
A: 可以，当作普通 HTML 元素用就行。详见 [API 文档](docs/api-reference.md)。

**Q: 头像加载不出来怎么办？**  
A: 头像来自 PRTS Wiki。加载失败不影响选择，文字候选依然可用。

## 更多文档

- [完整 API 文档](docs/api-reference.md)
- [在线 Demo](https://decolv.github.io/yet-another-arknights-input/)

## 本地开发

```bash
npm install
npm run build       # 构建
npm test           # 测试
npm run demo       # 运行 demo
```

## 许可

ISC
