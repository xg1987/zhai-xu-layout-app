# 宅序 · 家居布局 App / Web 原型

当前版本：`v0.3.1`

同一套产品的两端响应式原型，两端都面向客户，方案分析与咨询由大模型 AI 完成（没有人工老师端）：

- App 端（小于 `1100px`）：底部导航含首页、项目、商城、咨询、我的。
- Web 端（大于等于 `1100px`）：底部导航含首页、项目、商城、咨询、我的（与 App 端一致），项目页为画布 + 点位详情工作台。
- 首页支持上传户型图，由大模型识别格局、找出问题点位并生成布置方案（点位直接落在上传的图上）。

## 本地运行

```bash
npm install
npm run dev   # 同时启动 API（127.0.0.1:3001）和前端（0.0.0.0:5173）
```

生产构建与启动：

```bash
npm run build
npm run start  # NODE_ENV=production，由 API 服务托管 dist 静态资源
```

Cloudflare Pages 部署：

```bash
npm run build
wrangler d1 migrations apply zhai-xu-auth-db --remote
wrangler pages deploy dist --project-name zhai-xu-layout-app
```

线上环境使用 `functions/api/[[path]].js` 提供登录接口，并通过 `wrangler.toml` 绑定 D1 数据库。

## 发布约定

每次正式更新默认作为同一个完整发布：更新软件版本号、构建验证、提交并推送 GitHub，再部署到 Cloudflare Pages 并核对线上版本。只有在明确要求时才跳过某一步。

## 账号体系

- 手机号 + 密码注册/登录，密码使用 bcrypt 加密存储于 SQLite（`server/data.db`，不入库控）。
- 会话使用 httpOnly Cookie（14 天有效期），退出登录即失效。
- 接口：`POST /api/register`、`POST /api/login`、`POST /api/logout`、`GET /api/me`。
- 生产部署务必置于 HTTPS 之后，并为 Cookie 增加 `Secure` 标记。

## AI 户型分析

- 接口：`POST /api/analyze-floorplan`（需登录），入参 `{ image: <base64>, mediaType }`，支持 JPG/PNG/WebP，10MB 以内。
- 服务端调用 Claude（`claude-opus-4-8`，视觉 + 结构化输出）识别户型并返回 `{ summary, points[] }`，点位含方位、建议、施工时机与图上百分比坐标。
- 本地运行需配置 `ANTHROPIC_API_KEY` 环境变量；Cloudflare Pages 需在项目设置中添加同名 Secret。未配置时接口返回 503 并提示。

主要验收尺寸为 App `390 × 844`、Web `1280 × 720`；Web 同时按 `1440 × 900` 概念规格设计。

## 已实现交互

- 首页上传户型图 → AI 分析生成点位方案，替换画布底图与施工清单。
- 图上点位与方案详情联动。
- 户型图缩放、平移与复位。
- 平面图 / 施工清单切换。
- App 底部首页、项目、商城、咨询、我的真实页面切换。
- Web 端底部导航同样提供首页、项目、商城、咨询、我的，项目页为审核工作台。
- 与 AI 布局助手的咨询消息发送。
- 重新校准、导出报告和点位确认流程。
