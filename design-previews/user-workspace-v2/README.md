# 家居风水工作台在线预览

版本：0.1.0。此目录是独立静态界面预览，不替换正式应用，也不连接账号、数据库或分析接口。

在线地址：https://zhai-xu-workspace-preview.pages.dev/

手机交互预览：https://zhai-xu-workspace-preview.pages.dev/phone

## 页面与交互

- `/`：响应式工作台，手机使用底部悬浮的工作台、历史记录、图层、大小四个入口；桌面保留侧栏。
- `/phone.html`：桌面浏览器中的可操作手机预览。
- `/version.json`：公开构建版本与 Git 提交；界面不显示版本标签。
- 风水罗盘保留二十四山、后天八卦、地支生肖、五行配色与独立转动；上传后停转，中心按钮切换为确认分析。
- 图片仅在浏览器内读取，不发送到服务端；历史记录仅保留当前页面会话，刷新清空。分析接口未接入，不能生成报告。
- 图层、大小在手机上使用底部面板，支持开关、滑杆缩放、适应窗口及键盘关闭。

## 构建与独立部署

```sh
npm run build
wrangler pages deploy dist --project-name zhai-xu-workspace-preview --branch main
```

构建不需要安装依赖。只复制明确列出的静态资源，不包括参考图、源目录说明、账户数据库或本地文件。
本次独立预览经用户明确授权，发布到 marsxiong19@gmail.com 的 Cloudflare 账户；正式应用仍遵守根目录 AGENTS.md 的账户规则。本预览项目独立于正式的 zhai-xu-layout-app，不部署根目录的 Functions/D1。

## 验证

已在内置浏览器检查 320×568、390×844、430×932 和 1280×800：导航位置、完整盘面、无横向溢出、图层开关、缩放、历史切换，以及上传后中心分析按钮和删除操作。
真实手机设备尚未验证。

设计参考：60fps.design 的 Airbnb 按压和底部面板交互、Component Gallery 的 Popover/Slider，沿用项目设计参考网站列表。
