export const runtime = 'edge';
import { NextResponse } from "next/server";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { r2 } from "@/lib/s3Client";

export async function GET() {
  try {
    const command = new ListObjectsV2Command({
      Bucket: process.env.R2_BUCKET_NAME,
    });

    const data = await r2.send(command);
    
    // ファイル名（Key）のリストを返すよ
    // 取得したデータの Key を配列にして返す
    const photos = data.Contents?.map(item => item.Key).filter(Boolean) || [];

    return NextResponse.json({ photos });
  } catch (error: any) {
    return NextResponse.json({ 
      error: "一覧の取得に失敗したよ", 
      details: error.message 
    }, { status: 500 });
  }
}