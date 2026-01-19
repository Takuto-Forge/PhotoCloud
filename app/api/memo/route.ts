export const runtime = 'edge';
import { NextResponse } from "next/server";
import { AwsClient } from 'aws4fetch';

const r2 = new AwsClient({
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
});

const MEMO_FILE = "system_memo.txt"; // メモ用のファイル名

// メモを読み込む
export async function GET() {
  const endpoint = `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com/${process.env.R2_BUCKET_NAME}/${MEMO_FILE}`;
  try {
    const response = await r2.fetch(endpoint);
    if (!response.ok) return NextResponse.json({ memo: "" }); // ファイルがない時は空を返す
    const text = await response.text();
    return NextResponse.json({ memo: text });
  } catch {
    return NextResponse.json({ memo: "" });
  }
}

// メモを保存する
export async function POST(request: Request) {
  try {
    const { text } = await request.json();
    const endpoint = `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com/${process.env.R2_BUCKET_NAME}/${MEMO_FILE}`;
    
    const response = await r2.fetch(endpoint, {
      method: 'PUT',
      body: text,
      headers: { 'Content-Type': 'text/plain' }
    });

    if (!response.ok) throw new Error("保存失敗");
    return NextResponse.json({ message: "保存したよ！" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}