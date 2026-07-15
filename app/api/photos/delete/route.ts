export const runtime = 'edge';
import { NextResponse } from "next/server";
import { AwsClient } from 'aws4fetch';

// 他のAPIと同じく、軽量なAwsClientを使うよ
const r2 = new AwsClient({
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
});

async function deleteGeneratedThumbnails(filename: string) {
  const workerUrl = process.env.THUMBNAIL_WORKER_URL?.replace(/\/$/, "");
  const workerSecret = process.env.THUMBNAIL_WORKER_SECRET;

  if (!workerUrl || !workerSecret) return false;

  const url = new URL(workerUrl);
  const basePath = url.pathname.replace(/\/$/, "");
  url.pathname = `${basePath}/thumbnail`;
  url.search = new URLSearchParams({ key: filename }).toString();

  const response = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${workerSecret}` },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`生成済みサムネイルの削除に失敗しました: ${response.status}`);
  }

  return true;
}

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

    let thumbnailsDeleted = false;
    try {
      thumbnailsDeleted = await deleteGeneratedThumbnails(filename);
    } catch (thumbnailError) {
      // 原本の削除は成功しているため，孤立サムネイルの掃除失敗だけを記録する．
      console.warn("Thumbnail Delete Error:", thumbnailError);
    }

    return NextResponse.json({ message: "削除したよ！", thumbnailsDeleted });
  } catch (error: unknown) {
    const details = error instanceof Error ? error.message : "不明なエラー";
    console.error("Delete Error:", error);
    return NextResponse.json({ 
      error: "削除に失敗したよ",
      details,
    }, { status: 500 });
  }
}
