export const runtime = "edge";

import { NextResponse } from "next/server";
import { AwsClient } from "aws4fetch";

const r2 = new AwsClient({
  accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
});

function decodeXml(value: string) {
  return value.replace(
    /&(amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi,
    (entity, code: string) => {
      const namedEntities: Record<string, string> = {
        amp: "&",
        lt: "<",
        gt: ">",
        quot: '"',
        apos: "'",
      };

      if (code.startsWith("#x")) {
        return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
      }

      if (code.startsWith("#")) {
        return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
      }

      return namedEntities[code.toLowerCase()] ?? entity;
    },
  );
}

function getXmlValues(xml: string, tagName: string) {
  const expression = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, "g");
  return Array.from(xml.matchAll(expression), (match) => decodeXml(match[1]));
}

function getXmlValue(xml: string, tagName: string) {
  return getXmlValues(xml, tagName)[0];
}

function getTimestampFromKey(key: string) {
  const filename = key.split("/").at(-1) || key;
  const match = filename.match(/^(\d{13})_/);
  return match ? Number(match[1]) : 0;
}

export async function GET() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const bucketName = process.env.R2_BUCKET_NAME;

  if (!accountId || !bucketName) {
    return NextResponse.json(
      { error: "R2の接続設定が不足しています" },
      { status: 500 },
    );
  }

  const bucketEndpoint = `https://${accountId}.r2.cloudflarestorage.com/${bucketName}`;

  try {
    const photos: string[] = [];
    let continuationToken: string | undefined;

    do {
      const url = new URL(bucketEndpoint);
      url.searchParams.set("list-type", "2");
      url.searchParams.set("max-keys", "1000");

      if (continuationToken) {
        url.searchParams.set("continuation-token", continuationToken);
      }

      const response = await r2.fetch(url.toString());

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`R2へのアクセスに失敗しました: ${response.status} ${errorText}`);
      }

      const xml = await response.text();
      photos.push(...getXmlValues(xml, "Key"));

      const isTruncated = getXmlValue(xml, "IsTruncated") === "true";
      continuationToken = isTruncated
        ? getXmlValue(xml, "NextContinuationToken")
        : undefined;

      if (isTruncated && !continuationToken) {
        throw new Error("R2の次ページ取得トークンが見つかりませんでした");
      }
    } while (continuationToken);

    const sortedPhotos = photos
      .filter((key) => key && !key.endsWith("/") && key !== "family_memo.txt")
      .sort((left, right) => {
        const timestampDifference =
          getTimestampFromKey(right) - getTimestampFromKey(left);

        return timestampDifference || right.localeCompare(left);
      });

    return NextResponse.json(
      { photos: sortedPhotos },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error: unknown) {
    const details = error instanceof Error ? error.message : "不明なエラー";
    console.error("GET Photos Error:", error);

    return NextResponse.json(
      { error: "一覧の取得に失敗しました", details },
      { status: 500 },
    );
  }
}
