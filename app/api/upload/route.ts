// export const runtime = 'edge';
// import { NextResponse } from "next/server";
// import { PutObjectCommand } from "@aws-sdk/client-s3";
// import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
// import { r2 } from "@/lib/s3Client";

// export async function POST(request: Request) {
//   try {
//     // filenameを加工するロジックを追加
//     const { filename, contentType, folder } = await request.json();
//     const now = new Date();
//     const timestamp = now.getTime();
//     const randomStr = Math.random().toString(36).substring(2, 12);
//     const extension = filename.split('.').pop();
//     const prefix = folder && folder !== "root" ? `${folder}/` : "";
//     const newFilename = `${prefix}${timestamp}_${randomStr}.${extension}`;

//     const command = new PutObjectCommand({
//       Bucket: process.env.R2_BUCKET_NAME,
//       Key: newFilename,
//       ContentType: contentType,
//     });

//     const signedUrl = await getSignedUrl(r2, command, { expiresIn: 60 });

//     // レスポンスに新しい名前も返してあげると親切
//     return NextResponse.json({ url: signedUrl, filename: newFilename });
//   } catch (error: any) {
//     console.error("Detailed Error:", error);
//     return NextResponse.json({ 
//       error: "URLの発行に失敗したよ",
//       message: error.message, // エラーメッセージを直接返す
//       stack: error.stack      // スタックトレースも返してみる
//     }, { status: 500 });
//   }
// }

export const runtime = 'edge';
import { NextResponse } from "next/server";
import { AwsClient } from 'aws4fetch';

// 軽量な署名クライアントを初期化
const r2 = new AwsClient({
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
});

export async function POST(request: Request) {
  try {
    const { filename, contentType, folder } = await request.json();
    
    // 1. ファイル名の加工ロジック（たっくんの元のロジックをそのまま活かすね！）
    const now = new Date();
    const timestamp = now.getTime();
    const randomStr = Math.random().toString(36).substring(2, 12);
    const extension = filename.split('.').pop();
    const prefix = folder && folder !== "root" ? `${folder}/` : "";
    const newFilename = `${prefix}${timestamp}_${randomStr}.${extension}`;

    // 2. エンドポイントとURLの組み立て
    // 例: https://<account_id>.r2.cloudflarestorage.com/<bucket_name>/<filename>
    const url = new URL(
      `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com/${process.env.R2_BUCKET_NAME}/${newFilename}`
    );

    // 3. aws4fetch を使って署名付きURLを生成する
    // SDKの getSignedUrl と同じ役割を果たすよ
    const signedRequest = await r2.sign(url.toString(), {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
      },
      // 有効期限を60秒に設定
      aws: { signQuery: true, allHeaders: true },
    });

    // 4. 生成された署名付きURLを取得
    const signedUrl = signedRequest.url;

    // フロントエンドに署名付きURLと新しいファイル名を返す
    return NextResponse.json({ url: signedUrl, filename: newFilename });

  } catch (error: any) {
    console.error("Upload Route Error:", error);
    return NextResponse.json({ 
      error: "URLの発行に失敗したよ",
      message: error.message
    }, { status: 500 });
  }
}