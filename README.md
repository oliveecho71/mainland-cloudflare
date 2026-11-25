# 摄影实战约课网站｜Cloudflare Workers + D1 部署版

本版本保留原网站页面和预约业务，已将原来的本地 SQLite 适配层改为 Cloudflare D1，并配置 Next.js OpenNext Workers 部署。不是 Pages 静态站点，请部署到 **Workers**。

## 1. 创建 D1 数据库

在 Cloudflare Dashboard → Workers & Pages → D1 创建数据库，名称建议：`fieldclass-booking`。

也可以在项目目录执行：

```bash
npx wrangler d1 create fieldclass-booking
```

把命令返回的 `database_id` 填入 `wrangler.jsonc`：

```jsonc
"database_id": "这里填写真实的D1数据库ID"
```

`binding` 必须保持为 `DB`，不要修改。

## 2. 初始化数据库表

```bash
npm install
npx wrangler d1 migrations apply DB --remote
```

这会执行 `migrations/0001_initial_schema.sql`，创建学员、课程、预约、登录令牌和站点内容表。

## 3. 设置管理员密钥

在 Cloudflare Dashboard 打开该 Worker → Settings → Variables and Secrets → 添加 Secret：

- Name：`ADMIN_KEY`
- Value：自己生成的高强度随机密钥（建议至少 32 位）

不要把管理员密钥写进源码、GitHub 仓库或公开截图。

## 4. 本地预览

```bash
npm install
npm run preview
```

预览命令会使用 OpenNext 在 Workers 运行环境中构建并启动。D1 本地预览使用 Wrangler 本地数据库；正式库迁移请按第 2 步执行。

## 5. 部署

```bash
npm run deploy
```

部署成功后会得到 `*.workers.dev` 地址。之后可在 Worker 的 Settings → Domains & Routes 添加自定义域名。

## 6. GitHub Actions 自动部署

上传整个项目到 GitHub（默认分支 `main`），在仓库 Settings → Secrets and variables → Actions 添加：

- `CLOUDFLARE_API_TOKEN`：具有该账户 Workers Scripts 编辑权限的 API Token
- `CLOUDFLARE_ACCOUNT_ID`：Cloudflare Account ID

每次推送到 `main` 会自动构建并部署。首次部署前仍需先创建 D1、填好 `database_id`、执行远程迁移，并在 Worker 中设置 `ADMIN_KEY`。

## 7. 迁移原 SQLite 数据

如果旧站数据仍在 SQLite 文件中，不能直接把 SQLite 文件上传给 D1。需要先导出 `students`、`lessons`、`bookings`、`site_content` 四张表的数据，再转换为 D1 可执行的批量 INSERT 导入。请先保留原数据库备份；不要把含学员手机号、密码哈希或邀请码的快照提交到公开仓库。

本部署包不包含任何真实学员数据，也不会自动迁移旧服务器数据库。

## 技术说明

- Next.js 16 App Router + OpenNext Cloudflare adapter
- Cloudflare Workers：运行网站和 API
- Cloudflare D1：持久化关系型数据
- `ADMIN_KEY`：Cloudflare Worker Secret
- 数据库绑定名：`DB`

本包已提供部署配置和初始化迁移。部署前请将 `wrangler.jsonc` 中的数据库 ID 替换为你自己的值。
