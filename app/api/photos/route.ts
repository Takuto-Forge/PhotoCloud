// export const runtime = 'edge';
// import { NextResponse } from "next/server";
// import { ListObjectsV2Command } from "@aws-sdk/client-s3";
// import { r2 } from "@/lib/s3Client";

// export async function GET() {
//   try {
//     const command = new ListObjectsV2Command({
//       Bucket: process.env.R2_BUCKET_NAME,
//     });

//     const data = await r2.send(command);
    
//     // ファイル名（Key）のリストを返すよ
//     // 取得したデータの Key を配列にして返す
//     const photos = data.Contents?.map(item => item.Key).filter(Boolean) || [];

//     return NextResponse.json({ photos });
//   } catch (error: any) {
//     return NextResponse.json({ 
//       error: "一覧の取得に失敗したよ", 
//       details: error.message 
//     }, { status: 500 });
//   }
// }

export const runtime = 'edge';
import { NextResponse } from "next/server";
import { AwsClient } from 'aws4fetch';

// AWS SDKの代わりに、Edge環境で安全に動くAwsClientを使うよ！
const r2 = new AwsClient({
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
});

export async function GET() {
  // エンドポイントを組み立てるよ
  const endpoint = `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com/${process.env.R2_BUCKET_NAME}`;

  try {
    // 1. R2に直接fetchリクエストを送る
    const response = await r2.fetch(endpoint);
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`R2へのアクセスに失敗したよ: ${response.status} ${errorText}`);
    }

    // 2. レスポンス（XML形式）を取得
    const xml = await response.text();

    // 3. 正規表現を使って <Key>タグの中身（ファイル名）を抜き出すよ
    // これなら DOMParser がなくても大丈夫！
    const keyMatches = xml.match(/<Key>(.*?)<\/Key>/g);
    const photos = keyMatches 
        ? keyMatches.map(tag => tag.replace(/<\/?Key>/g, '')) 
        : [];

    // 4. ファイル名の配列を返す
    return NextResponse.json({ photos });

  } catch (error: any) {
    console.error("GET Photos Error:", error);
    return NextResponse.json({ 
      error: "一覧の取得に失敗したよ", 
      details: error.message 
    }, { status: 500 });
  }
}