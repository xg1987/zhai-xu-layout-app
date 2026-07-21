# 宅序项目发布规则

- 用户要求“发布”、“部署”或“更新软件”时，默认将版本号、GitHub 和 Cloudflare Pages 作为同一次发布处理，除非用户明确要求跳过某项。
- 发布前运行构建与必要测试，确认 Cloudflare 账号为 `xionggang1243@gmail.com`，发布后核对 GitHub 远程提交、Cloudflare 生产页面和公开版本号。
- 显式暂存本次发布文件，不提交本地数据库、密钥、Cookie、`.env` 或其他凭据。
