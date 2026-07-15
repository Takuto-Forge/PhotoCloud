export const runtime = "edge";

import { NextResponse } from "next/server";

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

const DEFAULT_SIZE = 480;
const MAX_SIZE = 2048;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function getOutputFormat(acceptHeader: string) {
  if (acceptHeader.includes("image/avif")) return "avif" as const;
  if (acceptHeader.includes("image/webp")) return "webp" as const;
  return "jpeg" as const;
}

function encodeObjectKey(key: string) {
  return key.split("/").map(encodeURIComponent).join("/");
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const key = requestUrl.searchParams.get("key");
  const publicUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL?.replace(/\/$/, "");

  if (!key || !publicUrl) {
    return NextResponse.json(
      { error: "画像またはR2の公開URLが指定されていません" },
      { status: 400 },
    );
  }

  const requestedSize = Number(requestUrl.searchParams.get("size"));
  const requestedQuality = Number(requestUrl.searchParams.get("quality"));
  const fit = requestUrl.searchParams.get("fit") === "contain" ? "contain" : "cover";
  const size = Number.isFinite(requestedSize)
    ? clamp(Math.round(requestedSize), 120, MAX_SIZE)
    : DEFAULT_SIZE;
  const quality = Number.isFinite(requestedQuality)
    ? clamp(Math.round(requestedQuality), 40, 90)
    : 72;
  const acceptHeader = request.headers.get("Accept") || "";
  const sourceUrl = `${publicUrl}/${encodeObjectKey(key)}`;

  try {
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
    headers.delete("Content-Disposition");

    return new Response(response.body, {
      status: response.status,
      headers,
    });
  } catch (error) {
    console.error("Thumbnail Error:", error);
    return new Response(null, { status: 502 });
  }
}
