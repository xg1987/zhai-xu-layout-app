# 宅序 · 家居布局 App / Web 原型

当前版本：`v0.2.0`

同一套产品的两端响应式原型：

- App 端（小于 `1100px`）：面向客户，查看户型点位、施工清单、咨询与个人设置。
- Web 端（大于等于 `1100px`）：面向老师，管理项目、审核点位、维护规则库。

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

主要验收尺寸为 App `390 × 844`、Web `1280 × 720`；Web 同时按 `1440 × 900` 概念规格设计。

## 已实现交互

- 图上 01–05 点位与方案详情联动。
- 户型图缩放、平移与复位。
- 平面图 / 施工清单切换。
- App 底部首页、项目、咨询、我的真实页面切换。
- 咨询消息本地发送。
- Web 项目、方案审核、规则库页面切换。
- Web 重新校准、导出状态和点位确认流程。
