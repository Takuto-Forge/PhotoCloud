# PhotoCloud

家族専用の写真・動画バックアップ＆閲覧アプリです．Next.jsとCloudflare R2で動作します．

## Cloudflareの画像最適化設定

写真一覧では，`/api/thumbnail` がCloudflare Image Transformationsを使って原本から軽量なAVIF／WebPサムネイルを生成します．HEICもブラウザ向けの形式へ変換されます．

本番公開前にCloudflare Dashboardの **Images → Transformations** から，PhotoCloudを配信しているZoneのTransformationsを有効にしてください．設定されていない場合は原本画像へ自動的にフォールバックします．

Cloudflare Images Freeでは月5,000件のユニークな変換まで利用できます．同じ画像・同じ設定の再表示は，その月の追加変換として数えられません．

## Environment Variables

```text
ADMIN_PASSWORD=
AUTH_SECRET=
CLOUDFLARE_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
NEXT_PUBLIC_R2_PUBLIC_URL=
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
