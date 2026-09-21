# 家居风水在线工作台

当前独立站点版本：0.2.3。部署于 marsxiong19@gmail.com 的 Cloudflare 账户，项目名 zhai-xu-workspace-preview；正式 zhai-xu-layout-app 项目不受影响。

- 工作台：https://zhai-xu-workspace-preview.pages.dev/
- 管理后台：https://zhai-xu-workspace-preview.pages.dev/admin
- 用户登录：/login；管理员登录：/login?admin=1；邀请码注册：/register。
- 手机交互预览：/phone；公开版本：/version.json。

## 已接通

- Pages Functions 与独立 D1 数据库 zhai-xu-workspace-auth 支持真实登录、退出、账号管理、注册审核、邀请码及管理操作记录。
- 邀请注册必须持有有效、未过期、未用完的邀请码；注册后等待管理员审核。普通用户不能访问管理接口。
- 密码采用随机盐 PBKDF2-SHA256；数据库仅保存密码摘要。会话使用随机令牌和 HttpOnly / Secure / SameSite Cookie，数据库仅保存令牌摘要。
- 登录限速、同源写入校验、停用账号撤销会话。注册与邀请码使用次数通过 D1 批处理事务更新。
- 初始化管理员由部署人员直接写入数据库；账号密码不在源码、构建资源或迁移文件中。
- 手机工作台使用底部悬浮组件；图层和大小采用底部面板。保留风水罗盘的三层转动、五行配色及上传后的中央确认按钮。
- 登录沿用已确认的东方住宅视频和透明卡片，支持减少动态效果。

## 当前边界

户型图片仍仅在当前浏览器页面中读取，历史记录随页面刷新清空；分析服务未接入，不生成模拟报告。管理后台已复用原项目冰蓝玻璃界面（原提交 ebd711bb7b5a20e48526c3fd7b07983af07dfc8f），恢复概览、账号管理、邀请码、图片识别配置、用量费用、操作日志和系统设置。模型调用与费用数据从新云端数据库产生；本地模型密钥、历史账号和调用记录未自动上传。模型实际付费调用需管理员配置有效 API Key 后验证。

## 构建和发布

```sh
npm test
npm run build
wrangler d1 migrations apply DB --remote
wrangler pages deploy dist --project-name zhai-xu-workspace-preview --branch main
```

构建前运行 `npm ci`，React 管理后台由 esbuild 打包。服务端代码通过 Functions 打包，公开 dist 仅包含白名单静态资源。`.wrangler/` 和 `dist/` 均不提交。

## 验证

九组服务端测试覆盖会话保护、错误密码、跨站请求、邀请限额与事务回滚、注册审核、权限、管理员保护、限速、页面守卫及退出。
已使用本地 Cloudflare Workers/D1 运行完整邀请注册→审核→用户登录→越权拒绝→退出流程。
内置浏览器检查登录、注册、管理后台桌面及 390px 手机布局；工作台此前检查 320×568、390×844、430×932 和 1280×800。未声称真机验证。

设计参考：项目原有 60fps.design、Navbar Gallery、Component Gallery 等参考集。

## 原版后台适配

- `admin-src/components/admin/` 复用原版 React 组件及样式；原有用户工作台保持独立。
- 数据库迁移 0002 仅增加审核备注与模型、用量表，保留现有用户和密码。
- `MODEL_ENCRYPTION_KEY` 必须作为 Pages secret 设置为随机 32 字节十六进制字符串；不得放入源码或公开变量。模型密钥经 AES-GCM 加密后写入 D1。
- 费用计算沿用原项目计价规则，属于估算，实际扣费以服务商账单为准。
- 验证包含原版管理接口、资料更新、重置密码、审核、角色与状态保护、模型密钥加密、受控模型响应的用量入账与错误脱敏；没有用真实密钥产生测试费用。

### 0.2.2 请求兼容修复

模型与汇率请求统一使用 Workers 支持的 manual 重定向模式，拒绝 3xx，防止密钥被转发；区分超时、连接失败、运行环境异常和重定向。十组测试覆盖上述分支。真实 Workers 本地运行验证 Google 无密钥请求可返回 HTTP 响应，汇率接口可访问。

### 0.2.3 Qwen 模型更新

Qwen 切换为 Qwen3.8-Max，使用北京默认业务空间专属接口；同步 Max 公开原价。保留已保存的加密密钥和历史调用价格，历史记录按实际模型显示。
