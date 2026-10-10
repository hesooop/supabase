# Supabase 对象存储

基于 Supabase Storage 的图片和文件管理网站（Next.js 15 + TypeScript + Tailwind）。

- **公开资源 `public-assets`**：只能放图片（≤10MB），通过公开 CDN URL 分发，缩略图走 Supabase 图片变换 API
- **私有文件 `private-files`**：任意类型（≤50MB），只能通过限时签名 URL（1 小时）访问
- 支持上传（多选或拖拽）、文件夹、预览（图片、视频、PDF、文本）、复制链接、下载、重命名和删除
- **RLS**：`storage.objects` 上的策略规定，登录用户只能对 `<bucket>/<auth.uid()>/...` 下的对象做 select/insert/update/delete，
  见 `supabase/migrations/20261010000000_storage_buckets_rls.sql`

## 本地运行

```bash
supabase start                 # 启动本地 Supabase，并自动应用 migration（建桶和 RLS 策略）
cp .env.example .env.local     # 填入 supabase start 输出的 API URL 和 anon key
npm install
npm run dev                    # http://localhost:3000
npm run verify:rls             # 用两个测试用户和匿名身份验证 RLS 隔离
```

## 接入线上 Supabase 项目

```bash
supabase link --project-ref <project-ref>
supabase db push               # 把建桶和 RLS migration 推到线上
```

然后在 `.env.local` 或部署平台里设置 `NEXT_PUBLIC_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_ANON_KEY`。

> 注意：图片变换 API（缩略图）在线上需要 Pro 套餐；没有的话缩略图会加载失败，原图链接不受影响。

### Hosted project notes

- Hosted projects require email confirmation by default: after sign-up the app asks the user to confirm via email, then sign in. Add your deployed URL to **Authentication → URL Configuration** (Site URL / Redirect URLs) so confirmation links point to it.
- Run the RLS checks against a hosted project (test users are created pre-confirmed and deleted afterwards):

```sh
SUPABASE_URL=https://<project-ref>.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key> \
SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
npm run verify:rls
```

- Without image transformations (free plan), thumbnails fall back to the original public URL.

## Deploy with Docker

`NEXT_PUBLIC_*` values are baked in at build time:

```sh
docker build -t supa-storage \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key> .
docker run -d --name supa-storage --restart unless-stopped --memory 256m \
  -p 127.0.0.1:3001:3000 supa-storage
```

Put a reverse proxy with TLS (e.g. 1Panel OpenResty, Caddy, nginx) in front of port 3001, and set the public URL as the Supabase Auth Site URL / redirect URL.
