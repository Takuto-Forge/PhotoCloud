export const runtime = "edge";

import { NextResponse } from "next/server";
import {
  isThumbnailVariant,
  type ThumbnailVariant,
} from "@/lib/thumbnails";

type CloudflareImageRequestInit = RequestInit & {
  cf: {
    image: {
      fit: "cover" | "contain";
      width: number;
      height: number;
      quality: number;
      format: "avif" | "webp" | "jpeg";
      metadata: "none";
    };
  };
};

const LEGACY_VARIANTS: Record<
  ThumbnailVariant,
  { size: number; fit: "cover" | "contain"; quality: number }
> = {
  gallery: { size: 320, fit: "cover", quality: 50 },
  preview: { size: 1600, fit: "contain", quality: 82 },
};

function getOutputFormat(acceptHeader: string) {
  if (acceptHeader.includes("image/avif")) return "avif" as const;
  if (acceptHeader.includes("image/webp")) return "webp" as const;
  return "jpeg" as const;
}

function encodeObjectKey(key: string) {
  return key.split("/").map(encodeURIComponent).join("/");
}

function getRequestedVariant(url: URL) {
  const requestedVariant = url.searchParams.get("variant");

  if (!requestedVariant) return "gallery" as const;
  return isThumbnailVariant(requestedVariant) ? requestedVariant : null;
}

function getWorkerConfig() {
  const workerUrl = process.env.THUMBNAIL_WORKER_URL?.replace(/\/$/, "");
  const workerSecret = process.env.THUMBNAIL_WORKER_SECRET;

  return workerUrl && workerSecret ? { workerUrl, workerSecret } : null;
}

function createWorkerRequest(
  workerUrl: string,
  workerSecret: string,
  key: string,
  variant: ThumbnailVariant,
  method: "GET" | "DELETE" = "GET",
) {
  const url = new URL(workerUrl);
  const basePath = url.pathname.replace(/\/$/, "");
  url.pathname = `${basePath}/thumbnail`;
  url.search = new URLSearchParams({ key, variant }).toString();

  return new Request(url, {
    method,
    headers: { Authorization: `Bearer ${workerSecret}` },
  });
}

async function fetchWorkerThumbnail(
  key: string,
  variant: ThumbnailVariant,
  config: NonNullable<ReturnType<typeof getWorkerConfig>>,
) {
  return fetch(
    createWorkerRequest(config.workerUrl, config.workerSecret, key, variant),
    { cache: "no-store" },
  );
}

async function fetchLegacyThumbnail(
  request: Request,
  key: string,
  variant: ThumbnailVariant,
) {
  const publicUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL?.replace(/\/$/, "");

  if (!publicUrl) {
    return NextResponse.json(
      { error: "Thumbnail Workerが未設定です" },
      { status: 503 },
    );
  }

  const { size, fit, quality } = LEGACY_VARIANTS[variant];
  const acceptHeader = request.headers.get("Accept") || "";
  const sourceUrl = `${publicUrl}/${encodeObjectKey(key)}`;
  const imageRequest = new Request(sourceUrl, {
    headers: { Accept: acceptHeader },
  });
  const imageOptions: CloudflareImageRequestInit = {
    cf: {
      image: {
        fit,
        width: size,
        height: size,
        quality,
        format: getOutputFormat(acceptHeader),
        metadata: "none",
      },
    },
  };
  const response = await fetch(imageRequest, imageOptions);

  if (!response.ok || !response.body) {
    return new Response(null, { status: response.status || 502 });
  }

  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, max-age=31536000, immutable");
  headers.set("Vary", "Accept");
  headers.set("X-PhotoCloud-Thumbnail", "legacy");
  headers.delete("Content-Disposition");

  return new Response(response.body, { status: response.status, headers });
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const key = requestUrl.searchParams.get("key");
  const variant = getRequestedVariant(requestUrl);

  if (!key || !variant) {
    return NextResponse.json(
      { error: "画像またはサムネイル種別が正しくありません" },
      { status: 400 },
    );
  }

  try {
    const workerConfig = getWorkerConfig();

    if (!workerConfig) {
      // Workerの設定前も画像が消えないよう，旧方式を一時的に残す．
      return fetchLegacyThumbnail(request, key, variant);
    }

    const response = await fetchWorkerThumbnail(key, variant, workerConfig);

    if (!response.ok || !response.body) {
      return new Response(null, { status: response.status || 502 });
    }

    const headers = new Headers();
    for (const headerName of [
      "Content-Type",
      "Content-Length",
      "ETag",
      "Last-Modified",
      "X-PhotoCloud-Thumbnail",
    ]) {
      const value = response.headers.get(headerName);
      if (value) headers.set(headerName, value);
    }
    headers.set("Cache-Control", "private, max-age=31536000, immutable");

    return new Response(response.body, { status: response.status, headers });
  } catch (error) {
    console.error("Thumbnail Error:", error);
    return new Response(null, { status: 502 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      key?: unknown;
      variant?: unknown;
    };
    const key = typeof payload.key === "string" ? payload.key : "";
    const requestedVariant =
      typeof payload.variant === "string" ? payload.variant : "gallery";
    const variant = isThumbnailVariant(requestedVariant)
      ? requestedVariant
      : null;
    const workerConfig = getWorkerConfig();

    if (!key || !variant) {
      return NextResponse.json(
        { error: "画像またはサムネイル種別が正しくありません" },
        { status: 400 },
      );
    }

    if (!workerConfig) {
      return NextResponse.json(
        { error: "Thumbnail Workerが未設定です" },
        { status: 503 },
      );
    }

    const response = await fetchWorkerThumbnail(key, variant, workerConfig);

    if (!response.ok) {
      const details = await response.text();
      return NextResponse.json(
        { error: "サムネイルを準備できませんでした", details },
        { status: response.status },
      );
    }

    // Worker側の生成とR2への保存が完了するまでレスポンスを読み切る．
    await response.arrayBuffer();

    return NextResponse.json({
      ok: true,
      cache: response.headers.get("X-PhotoCloud-Thumbnail") || "unknown",
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : "不明なエラー";
    console.error("Thumbnail Warmup Error:", error);
    return NextResponse.json(
      { error: "サムネイルを準備できませんでした", details },
      { status: 502 },
    );
  }
}
