export const runtime = 'edge';
import { NextResponse } from "next/server";
import { AwsClient } from 'aws4fetch';

// 他のAPIと同じく、軽量なAwsClientを使うよ
const r2 = new AwsClient({
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
});

export async function POST(request: Request) {
  try {
    const { filename } = await request.json();

    // 削除対象のフルURLを組み立てる
    const endpoint = `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com/${process.env.R2_BUCKET_NAME}/${filename}`;

    // DELETE メソッドでリクエストを送る
    const response = await r2.fetch(endpoint, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`削除に失敗したよ: ${response.status} ${errorText}`);
    }

    return NextResponse.json({ message: "削除したよ！" });
  } catch (error: any) {
    console.error("Delete Error:", error);
    return NextResponse.json({ 
      error: "削除に失敗したよ",
      details: error.message 
    }, { status: 500 });
  }
}