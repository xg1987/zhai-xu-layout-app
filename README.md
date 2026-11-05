# 宅序 · v0.1.3

本版新增单房间照片扫描、可编辑物品清单、相对布局草图与按账号隔离的房间记录，并将账户、邀请审核、模型设置与用量后台适配到 Cloudflare Pages / D1。保留东方住宅视频登录页和已确认的纯白空间罗盘。

发布沿用 `codex/prototype-v0.1.0` 分支；仓库 `main` 是另一套独立工作台，本次不覆盖。扫描版独立发布到 Cloudflare Pages 项目 `zhai-xu-room-scan`，使用独立 D1 数据库；保留现有 `zhai-xu-workspace-preview` 站点及其数据，不在旧站点上覆盖更新。`v0.1.2` Git 标签保留为此前源码存档。

本版发布账号为 `marsxiong19@gmail.com`，目标站点为 `https://zhai-xu-room-scan.pages.dev`。公开版本路径为 `/version.json`，内容包含构建版本和 Git 提交；是否已上线以该独立站点的实际部署核对结果为准。

## 房间扫描

登录后点击工作台“房间扫描”，进入 `/scan`。支持手机相机拍照或选择相册照片，同一房间最多四张。图片在浏览器等比例压缩；只有勾选同意并点击识别，才会发送给管理员已配置的 Gemini / Qwen 服务。未配置模型时明确提示，可先手动记录与保存。

识别提取可见家具、门窗、照片中的标记框与待核对事项。可修改物品名称、类别和说明、删除重复项，手动放入草图并拖动或输入相对坐标，逐项确认。填写房间类型不会锁定照片；已有物品或识别证据时，需明确清除结果后才能增删照片。

草图记录相对位置，不是实测户型图或 LiDAR 三维重建。精确尺寸和真实北向需要单独测量；未知位置与北向保留空值，不生成风水结论。相机权限和传感器仍需真实手机验收。

Cloudflare 房间数据保存在 D1，按登录账号隔离，采用版本号防止旧编辑覆盖新记录。照片按 512 KiB 分块保存，避免超过 D1 单行限制；新增、替换与删除均使用原子批处理。Node 本地运行使用独立 SQLite 数据库，不自动迁移本机账号、照片或模型密钥到云端。

## 空间罗盘

- 保留南上北下、东左西右展示；真实方位角为北 0/360°、东 90°、南 180°、西 270°。
- 初始无默认户型；可上传图片、校准方位、点选与拖动轮廓、撤销、缩放及调整图层。
- 原有户型历史仍保存在当前浏览器的 IndexedDB，与新增的服务端房间记录分开；清除网站数据会删除这些浏览器历史。
- 户型图片识别支持北向与轮廓人工确认。分析规则尚未提供，不生成吉凶或其他无依据的结论；室外功能尚未开放。

## 账户与后台

用户登录 `/login`，管理员登录 `/admin/login`。公开注册需要有效邀请码，管理员审核通过后才允许登录。后台包括账号启停与角色、密码重置、邀请管理、操作记录、模型配置、费用记录及系统设置。

本扫描版使用独立云端账号库，不自动复制旧站点或本机的账号、密码、角色、会话及模型密钥。迁移脚本只补目标数据库中缺失的字段与新表，保留其中已有数据。兼容旧 PBKDF2 和 bcrypt 密码；云端新密码使用原生 Web Crypto PBKDF2。脚本不会创建默认管理员，也不会提升旧账号权限。管理员开通必须使用已有授权流程。

停用、角色变更、重置密码与本人改密均撤销相关会话。写入接口检查请求来源；登录和密码错误次数在 D1 持久限流。邀请码只保存摘要，新邀请码完整值仅在创建时返回。

## 模型配置与费用

管理员进入 `/admin/models` 保存 Gemini 或百炼北京地域 Qwen 的 API Key。密钥不回显，不存浏览器；云端通过 `VISION_MASTER_KEY` 使用 AES-GCM 加密后保存到 D1，本地使用被忽略的 `server/.vision-master-key`。密钥、数据库和加密主密钥不得提交 Git。

两家模型均配置时，主服务失败或输出格式不合规会尝试备用服务。图片、模型原始回答和密钥不进入费用日志。模型未返回用量或汇率缺失时费用标为待核对；逐次主备请求独立记账，人民币金额按纳元累计。价格快照属于成本估算，实际扣费以服务商账单为准。

发布检查使用模拟模型，不发生真实计费调用。真实识别效果必须在用户配置模型后另行验收。

## 本地运行与验证

使用 Node.js 22.12+：

```sh
npm ci
npm run dev:local-auth
```

打开 `http://127.0.0.1:5178/login`。本机 API 在 127.0.0.1:3001；数据库 `server/local-auth.sqlite` 与生产 D1 完全独立。Node 部署时可设置 `DATABASE_FILE`、`VISION_MASTER_FILE` 与 `APP_ORIGIN`。

```sh
node --test server/*.test.js src/components/scan/*.test.js cloudflare/*.test.js
npm run build
npx wrangler pages functions build --outdir /tmp/zhai-xu-worker
node scripts/prepare-cloudflare.mjs --local
```

## Cloudflare 发布

本次用户明确指定部署账号为 `marsxiong19@gmail.com`，覆盖旧 `AGENTS.md` 中的账号要求。发布前必须用 `wrangler whoami` 核对该账号。发布目标仅为独立 Pages 项目 `zhai-xu-room-scan`；独立 D1 的 `DB` 绑定见本版 `wrangler.toml`，不得绑定或改写 `zhai-xu-workspace-preview` 的数据库。先运行 `node scripts/prepare-cloudflare.mjs --remote`；脚本自动检查账号，只添加目标库缺失结构，不导入或替换本机数据。

首次配置云端模型功能时，将随机 32 字节 Base64 值通过标准输入写入 Pages secret `VISION_MASTER_KEY`；已有密钥不得随意替换，否则原加密模型配置无法解密。不要把任何密钥写进代码、命令参数或公开变量。

构建并显式暂存本次发布文件，提交与推送分支及 `v0.1.3` 版本标签。再次构建使 `/version.json` 的提交对应最终发布提交，再用 `wrangler pages deploy dist --project-name zhai-xu-room-scan --branch <项目生产分支>` 部署。核对 GitHub 远程 SHA、该独立项目的生产部署、`https://zhai-xu-room-scan.pages.dev/version.json` 和构建资源，同时确认原 `zhai-xu-workspace-preview` 站点保持原状；内置浏览器验收与手机真机验收需分别报告。
