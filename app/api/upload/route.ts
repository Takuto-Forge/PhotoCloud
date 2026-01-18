export const runtime = 'edge';
import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2 } from "@/lib/s3Client";

export async function POST(request: Request) {
  try {
    // filenameを加工するロジックを追加
    const { filename, contentType, folder } = await request.json();
    const now = new Date();
    const timestamp = now.getTime();
    const randomStr = Math.random().toString(36).substring(2, 12);
    const extension = filename.split('.').pop();
    const prefix = folder && folder !== "root" ? `${folder}/` : "";
    const newFilename = `${prefix}${timestamp}_${randomStr}.${extension}`;

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: newFilename,
      ContentType: contentType,
    });

    const signedUrl = await getSignedUrl(r2, command, { expiresIn: 60 });

    // レスポンスに新しい名前も返してあげると親切
    return NextResponse.json({ url: signedUrl, filename: newFilename });
  } catch (error: any) {
    console.error("Detailed Error:", error);
    return NextResponse.json({ 
      error: "URLの発行に失敗したよ",
      message: error.message, // エラーメッセージを直接返す
      stack: error.stack      // スタックトレースも返してみる
    }, { status: 500 });
  }
}