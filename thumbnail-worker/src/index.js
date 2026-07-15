const THUMBNAIL_PREFIX = "__photocloud_thumbnails__/v1/";
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const DEFAULT_BACKFILL_LIMIT = 10;
const MAX_BACKFILL_LIMIT = 25;
const BACKFILL_CONCURRENCY = 3;
const MAX_CONCURRENT_GENERATIONS = 2;
const THUMBNAIL_RETRY_ATTEMPTS = 3;
const THUMBNAIL_RETRY_BASE_DELAY_MS = 250;

let activeGenerations = 0;
const generationWaiters = [];

const VARIANTS = {
  gallery: {
    width: 320,
    height: 320,
    fit: "cover",
    quality: 50,
  },
  preview: {
    width: 1600,
    height: 1600,
    fit: "contain",
    quality: 82,
  },
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function isAuthorized(request, env) {
  if (!env.AUTH_SECRET) return false;
  return request.headers.get("Authorization") === `Bearer ${env.AUTH_SECRET}`;
}

function requireBindings(env, includeImages = true) {
  if (!env.PHOTOS) {
    throw new HttpError(500, "R2 binding PHOTOS is not configured");
  }

  if (!env.THUMBNAILS) {
    throw new HttpError(500, "R2 binding THUMBNAILS is not configured");
  }

  if (includeImages && !env.IMAGES) {
    throw new HttpError(500, "Images binding IMAGES is not configured");
  }
}

function getVariant(value) {
  return Object.hasOwn(VARIANTS, value) ? value : null;
}

function getThumbnailKey(sourceKey, variant) {
  return `${THUMBNAIL_PREFIX}${variant}/${sourceKey}.webp`;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function withGenerationSlot(task) {
  if (activeGenerations >= MAX_CONCURRENT_GENERATIONS) {
    await new Promise((resolve) => generationWaiters.push(resolve));
  } else {
    activeGenerations += 1;
  }

  try {
    return await task();
  } finally {
    const next = generationWaiters.shift();

    if (next) next();
    else activeGenerations -= 1;
  }
}

function isRetryableError(error) {
  if (!(error instanceof HttpError)) return true;
  return error.status === 429 || error.status >= 500;
}

async function retryThumbnailTask(task) {
  let lastError;

  for (let attempt = 0; attempt < THUMBNAIL_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;

      if (
        !isRetryableError(error) ||
        attempt === THUMBNAIL_RETRY_ATTEMPTS - 1
      ) {
        throw error;
      }

      await delay(THUMBNAIL_RETRY_BASE_DELAY_MS * 2 ** attempt);
    }
  }

  throw lastError;
}

function isSourceImageKey(key) {
  if (
    !key ||
    key.endsWith("/") ||
    key === "family_memo.txt" ||
    key.startsWith(THUMBNAIL_PREFIX)
  ) {
    return false;
  }

  return /\.(?:avif|gif|heic|heif|jpe?g|png|webp)$/i.test(key);
}

function createCachedResponse(object, cacheState) {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", "image/webp");
  headers.set("Content-Length", String(object.size));
  headers.set("Cache-Control", "private, max-age=31536000, immutable");
  headers.set("ETag", object.httpEtag);
  headers.set("Last-Modified", object.uploaded.toUTCString());
  headers.set("X-PhotoCloud-Thumbnail", cacheState);

  return new Response(object.body, { headers });
}

function createGeneratedResponse(result) {
  const headers = new Headers({
    "Content-Type": "image/webp",
    "Content-Length": String(result.bytes.byteLength),
    "Cache-Control": "private, max-age=31536000, immutable",
    "X-PhotoCloud-Thumbnail": result.state,
  });

  if (result.storedObject?.httpEtag) {
    headers.set("ETag", result.storedObject.httpEtag);
  }

  return new Response(result.bytes, { headers });
}

async function ensureThumbnail(env, sourceKey, variant) {
  requireBindings(env);

  if (!isSourceImageKey(sourceKey)) {
    throw new HttpError(400, "The requested key is not a supported image");
  }

  const thumbnailKey = getThumbnailKey(sourceKey, variant);
  const cached = await env.THUMBNAILS.get(thumbnailKey);

  if (cached) {
    return { state: "HIT", object: cached };
  }

  return withGenerationSlot(async () => {
    // 同じ画像の要求が待機中に別リクエストで生成される場合があるため，再確認する．
    const cachedAfterWaiting = await env.THUMBNAILS.get(thumbnailKey);

    if (cachedAfterWaiting) {
      return { state: "HIT", object: cachedAfterWaiting };
    }

    const source = await env.PHOTOS.get(sourceKey);

    if (!source) {
      throw new HttpError(404, "Source image not found");
    }

    if (source.size > MAX_IMAGE_BYTES) {
      throw new HttpError(
        413,
        "Source image exceeds the 20 MB Images binding input limit",
      );
    }

    const options = VARIANTS[variant];
    const output = await env.IMAGES.input(source.body)
      .transform({
        width: options.width,
        height: options.height,
        fit: options.fit,
      })
      .output({
        format: "image/webp",
        quality: options.quality,
        anim: false,
      });
    const transformed = output.response();

    if (!transformed.ok) {
      const errorStatus =
        transformed.status === 429
          ? 429
          : transformed.status >= 400 && transformed.status < 500
            ? 422
            : 502;

      throw new HttpError(
        errorStatus,
        `Cloudflare Images returned ${transformed.status}`,
      );
    }

    const bytes = await transformed.arrayBuffer();
    const storedObject = await env.THUMBNAILS.put(thumbnailKey, bytes, {
      httpMetadata: {
        contentType: "image/webp",
        cacheControl: "private, max-age=31536000, immutable",
      },
      customMetadata: {
        sourceEtag: source.etag,
        variant,
      },
    });

    return { state: "MISS", bytes, storedObject };
  });
}

async function handleGetThumbnail(url, env) {
  const sourceKey = url.searchParams.get("key") || "";
  const variant = getVariant(url.searchParams.get("variant") || "gallery");

  if (!sourceKey || !variant) {
    throw new HttpError(400, "A valid key and variant are required");
  }

  const result = await retryThumbnailTask(() =>
    ensureThumbnail(env, sourceKey, variant),
  );
  return result.object
    ? createCachedResponse(result.object, result.state)
    : createGeneratedResponse(result);
}

async function handleDeleteThumbnail(url, env) {
  requireBindings(env, false);
  const sourceKey = url.searchParams.get("key") || "";

  if (!sourceKey || sourceKey.startsWith(THUMBNAIL_PREFIX)) {
    throw new HttpError(400, "A valid source key is required");
  }

  await Promise.all(
    Object.keys(VARIANTS).map((variant) =>
      env.THUMBNAILS.delete(getThumbnailKey(sourceKey, variant)),
    ),
  );

  return json({ ok: true, deleted: Object.keys(VARIANTS).length });
}

async function mapWithConcurrency(values, concurrency, task) {
  const results = new Array(values.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await task(values[currentIndex]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, worker),
  );
  return results;
}

async function handleBackfill(request, env) {
  requireBindings(env);
  const payload = await request.json().catch(() => ({}));
  const cursor = typeof payload.cursor === "string" ? payload.cursor : undefined;
  const requestedLimit = Number(payload.limit);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.round(requestedLimit), 1), MAX_BACKFILL_LIMIT)
    : DEFAULT_BACKFILL_LIMIT;
  const listing = await env.PHOTOS.list({ cursor, limit });
  const sourceKeys = listing.objects
    .map((object) => object.key)
    .filter(isSourceImageKey);
  const errors = [];
  let generated = 0;
  let cached = 0;

  await mapWithConcurrency(sourceKeys, BACKFILL_CONCURRENCY, async (sourceKey) => {
    try {
      const result = await retryThumbnailTask(() =>
        ensureThumbnail(env, sourceKey, "gallery"),
      );
      if (result.state === "HIT") cached += 1;
      else generated += 1;
    } catch (error) {
      errors.push({
        key: sourceKey,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  return json({
    scanned: listing.objects.length,
    processed: sourceKeys.length,
    generated,
    cached,
    failed: errors.length,
    errors,
    truncated: listing.truncated,
    cursor: listing.truncated ? listing.cursor : null,
  });
}

const thumbnailWorker = {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/health" && request.method === "GET") {
      return json({
        ok: Boolean(
          env.PHOTOS && env.THUMBNAILS && env.IMAGES && env.AUTH_SECRET,
        ),
        bindings: {
          photos: Boolean(env.PHOTOS),
          thumbnails: Boolean(env.THUMBNAILS),
          images: Boolean(env.IMAGES),
          secret: Boolean(env.AUTH_SECRET),
        },
      });
    }

    if (!isAuthorized(request, env)) {
      return json({ error: "Unauthorized" }, 401);
    }

    try {
      if (url.pathname === "/thumbnail") {
        if (request.method === "GET") return handleGetThumbnail(url, env);
        if (request.method === "DELETE") {
          return handleDeleteThumbnail(url, env);
        }

        return new Response(null, {
          status: 405,
          headers: { Allow: "GET, DELETE" },
        });
      }

      if (url.pathname === "/backfill" && request.method === "POST") {
        return handleBackfill(request, env);
      }

      return json({ error: "Not found" }, 404);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("Thumbnail Worker Error:", error);
      return json({ error: message }, status);
    }
  },
};

export default thumbnailWorker;

export { THUMBNAIL_PREFIX, VARIANTS, getThumbnailKey, isSourceImageKey };
