# PhotoCloud Thumbnail Worker

既存のPhotoCloud R2バケットから画像を読み込み，Cloudflare Images Bindingで固定WebPを生成・保存する専用Workerです．外部から直接画像を列挙されないよう，すべての画像操作はBearer Secretで保護します．

## Binding

| Binding | 種別 | 内容 |
|---|---|---|
| `PHOTOS` | R2 | 原本バケット`parfait-photocloud` |
| `THUMBNAILS` | R2 | `photocloud-thumbnails`専用バケット |
| `IMAGES` | Images | Cloudflare Images Binding |
| `AUTH_SECRET` | Secret | Pages APIと共有するランダム値 |

## Endpoint

| Method | Path | 用途 |
|---|---|---|
| `GET` | `/health` | Bindingの設定確認 |
| `GET` | `/thumbnail?key=...&variant=gallery` | 一覧用WebPの取得・初回生成 |
| `GET` | `/thumbnail?key=...&variant=preview` | 拡大用WebPの取得・初回生成 |
| `DELETE` | `/thumbnail?key=...` | 生成済みの全variantを削除 |
| `POST` | `/backfill` | 既存画像を少量ずつ事前変換 |

`/health`以外では`Authorization: Bearer <AUTH_SECRET>`が必要です．生成物は専用バケットの`__photocloud_thumbnails__/v1/`以下へ保存されます．原本バケットと分けるため，写真一覧のR2走査件数は増えません．

セットアップ手順はリポジトリルートのREADMEを参照してください．
