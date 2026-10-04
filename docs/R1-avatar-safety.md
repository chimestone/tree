# R1 头像安全修复：教学交接

日期：2026-10-04。实现由主对话完成，教学对话只负责解释。

本文记录 R1；当前启动、测试命令见 [README](../README.md)，全项目进度见 [TODO](../TODO.md)。

## 先理解发生了什么

HTML 中 `<img src="图片地址" alt="人物姓名">` 的 src 和 alt 是属性。
原代码把用户填写的字符串插进双引号，再交给 innerHTML 解析。
原 escapeHTML 把字符串当作文本处理，但文本中的双引号不会被转义。
因此它不适合直接保护双引号包围的 HTML 属性。

问题不是“用了头像就危险”，而是“用户数据有机会被浏览器重新解释成页面代码”。
后台 URL 输入框只是页面限制，直接调用新增/修改接口仍能绕过它。

## 实际修改

### 页面：public/index.html 中 createDetailAvatar 和 showInfoPanel

原先用字符串拼出整个 img 标签；现在先用 document.createElement('img') 创建图片。
再用 image.src、image.alt 设置数据，浏览器不会把值中的引号解析成新的属性。
详情的其他文本继续使用原文本转义，头像通过 content.prepend 插入。

前端先解析头像 URL，只接受 HTTP/HTTPS；这是保护旧数据的兜底。
空值、非法协议或无法解析的地址直接显示姓名首字。
图片加载失败通过 error 事件替换成首字占位。
占位使用 textContent，姓名中的特殊字符是文本；Array.from 按 Unicode 码点取首字，避免把单个 emoji 的 UTF-16 代理对切半。组合 emoji 或带组合符的字形仍可能只显示首码点，不代表已实现完整字形切分。
头像仍保持原 64 像素样式和节点颜色；图谱布局、节点大小及颜色计算未修改。

### 后端：server.js 中 normalizeAvatar

先处理可选文本，再使用 new URL 解析，只允许 http: 和 https:。
空值保留为空；合法地址转成标准 URL 字符串；非法输入返回 400 和 INVALID_AVATAR_URL。
新增人员和修改人员都经过此检查。未把新规则强加到旧数据库整体启动校验，避免旧头像导致整库无法启动。
修改接口先编辑副本、最后保存，因此头像验证失败不会把其他字段的半成品写进数据库。

URL 校验和 DOM 赋值承担不同职责：前者约束允许的数据，后者避免数据成为 HTML 结构。
本次仍允许 HTTP；HTTPS 页面可能拦截 HTTP 图片，此时显示首字占位。

## 如何验证

- R1 完成时 `node --test` 共 10 项通过；加入 R2 后当前为 11 项。头像相关用例覆盖新增/修改非法地址、合法 HTTP/HTTPS、清空头像，以及拒绝时原资料保持不变。
- `scripts/avatar.browser.cjs`：读取实际 index.html 脚本，关闭启动入口，在真实 Chrome 中调用 showInfoPanel。
- 图片网络由本地测试拦截器模拟，不请求第三方图片、不写真实数据库。
- 验证空头像、非法旧地址、带引号的姓名和头像 URL、正常图片、失败图片以及 emoji 姓名。
- 特殊字符串没有生成 onload/onerror 属性，测试标志未被执行；失败图片能回退。

浏览器脚本需已有 Playwright 和 Chrome，手工运行 `node scripts/avatar.browser.cjs`。
若 Playwright 不在项目模块目录，可用 PLAYWRIGHT_MODULE 指向已有安装；不需要为生产服务安装浏览器依赖。

## 教学顺序建议

1. 标签与属性是什么，浏览器何时把字符串解析为 HTML。
2. 文本位置与属性位置为什么有不同的转义要求。
3. 对比字符串拼标签与 createElement 设置属性。
4. 讲 new URL、协议检查和前后端各自作用。
5. 讲图片 error 事件、首字占位和实际测试。

一次解释一个小概念，结合仓库实际函数；不要把测试通过讲成所有安全问题都已解决。
