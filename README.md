# PhotoCloud

家族専用の写真・動画バックアップ＆閲覧アプリです．Next.jsとCloudflare R2で動作します．

## 高速サムネイル構成

写真一覧は，専用のCloudflare Workerが既存R2バケットから原本を読み取り，Cloudflare Images Bindingで固定サイズのWebPへ変換します．変換結果は専用の`photocloud-thumbnails` R2バケットへ保存されるため，HEICを含めて変換は原則1回だけです．原本と生成物を分けることで，写真一覧のR2走査件数も増やしません．

- 一覧: 320 x 320，WebP，品質50
- 拡大プレビュー: 最大1600 x 1600，WebP，品質82
- 初期表示: 18枚
- 追加表示: 18枚ずつ

この構成ではZoneや独自ドメインのImage Transformationsを有効にする必要はありません．WorkerにR2 BindingとImages Bindingを設定します．

### 1. Thumbnail Workerをデプロイ

```bash
cd thumbnail-worker
npm install
```

`wrangler.jsonc`は，現在使用中の原本R2バケット`parfait-photocloud`へ設定済みです．Cloudflareへログインし，サムネイル専用バケットを作成してデプロイします．原本バケットを将来改名した場合だけ，この設定も変更してください．

```bash
npx wrangler login
npx wrangler r2 bucket create photocloud-thumbnails
npm run deploy
npx wrangler secret put AUTH_SECRET --config wrangler.jsonc
```

`AUTH_SECRET`には十分に長いランダム値を設定し，同じ値を次のPages環境変数にも設定します．WorkerのURLはデプロイ結果に表示される`https://...workers.dev`です．

### 2. Cloudflare Pagesの環境変数

```text
THUMBNAIL_WORKER_URL=https://photocloud-thumbnail-worker.<subdomain>.workers.dev
THUMBNAIL_WORKER_SECRET=<WorkerのAUTH_SECRETと同じ値>
```

環境変数を保存したら，Pagesを再デプロイします．設定前は既存のサムネイル処理へ一時的にフォールバックするため，画像が突然消えることはありません．

### 3. 既存写真のサムネイルを事前生成

リポジトリのルートで次を一度実行します．1回10件ずつ処理し，R2のカーソルを使って最後まで継続します．すでに生成済みの画像は再変換されません．

```bash
THUMBNAIL_WORKER_URL="https://photocloud-thumbnail-worker.<subdomain>.workers.dev" \
THUMBNAIL_WORKER_SECRET="<設定したAUTH_SECRET>" \
npm run thumbnails:backfill
```

動作確認時はChrome DevToolsのNetworkで`/api/thumbnail`を選び，`Content-Type: image/webp`と`X-PhotoCloud-Thumbnail: MISS`または`HIT`を確認します．純粋な初回速度を測る場合は「キャッシュを無効化」を有効にして再読み込みします．

## Environment Variables

```text
ADMIN_PASSWORD=
AUTH_SECRET=
CLOUDFLARE_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
NEXT_PUBLIC_R2_PUBLIC_URL=
THUMBNAIL_WORKER_URL=
THUMBNAIL_WORKER_SECRET=
```

`NEXT_PUBLIC_R2_PUBLIC_URL`には，末尾のスラッシュを付けずにR2の公開URLまたはカスタムドメインを指定します．

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
