# 家居风水在线工作台

当前独立站点版本：0.2.0。部署于 marsxiong19@gmail.com 的 Cloudflare 账户，项目名 zhai-xu-workspace-preview；正式 zhai-xu-layout-app 项目不受影响。

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

户型图片仍仅在当前浏览器页面中读取，历史记录随页面刷新清空；分析服务未接入，不生成模拟报告。当前管理后台范围为账号、注册审核和邀请码，不包含模型配置或计费。

## 构建和发布

```sh
npm test
npm run build
wrangler d1 migrations apply DB --remote
wrangler pages deploy dist --project-name zhai-xu-workspace-preview --branch main
```

构建不需要额外依赖。服务端代码通过 Functions 打包，公开 dist 仅包含白名单静态资源。`.wrangler/` 和 `dist/` 均不提交。

## 验证

六组服务端测试覆盖会话保护、错误密码、跨站请求、邀请限额与事务回滚、注册审核、权限、管理员保护、限速、页面守卫及退出。
已使用本地 Cloudflare Workers/D1 运行完整邀请注册→审核→用户登录→越权拒绝→退出流程。
内置浏览器检查登录、注册、管理后台桌面及 390px 手机布局；工作台此前检查 320×568、390×844、430×932 和 1280×800。未声称真机验证。

设计参考：项目原有 60fps.design、Navbar Gallery、Component Gallery 等参考集。
