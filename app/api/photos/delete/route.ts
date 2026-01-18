export const runtime = 'edge';
import { NextResponse } from "next/server";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { r2 } from "@/lib/s3Client";

export async function POST(request: Request) {
  try {
    const { filename } = await request.json();
    const command = new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: filename,
    });

    await r2.send(command);
    return NextResponse.json({ message: "削除したよ！" });
  } catch (error) {
    return NextResponse.json({ error: "削除に失敗したよ" }, { status: 500 });
  }
}