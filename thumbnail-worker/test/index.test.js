import assert from "node:assert/strict";
import test from "node:test";

import worker, { getThumbnailKey } from "../src/index.js";

const encoder = new TextEncoder();

class MockBucket {
  constructor(entries = []) {
    this.entries = new Map(
      entries.map(([key, value]) => [key, this.createStoredValue(value)]),
    );
  }

  createStoredValue(value, options = {}) {
    const bytes =
      typeof value === "string"
        ? encoder.encode(value)
        : value instanceof ArrayBuffer
          ? new Uint8Array(value)
          : new Uint8Array(value);
    return {
      bytes,
      httpMetadata: options.httpMetadata || { contentType: "image/jpeg" },
      customMetadata: options.customMetadata || {},
      uploaded: new Date("2026-07-15T00:00:00Z"),
      etag: `etag-${bytes.byteLength}`,
    };
  }

  createObject(key, stored, includeBody = true) {
    return {
      key,
      size: stored.bytes.byteLength,
      etag: stored.etag,
      httpEtag: `"${stored.etag}"`,
      uploaded: stored.uploaded,
      body: includeBody ? new Blob([stored.bytes]).stream() : undefined,
      writeHttpMetadata(headers) {
        if (stored.httpMetadata.contentType) {
          headers.set("Content-Type", stored.httpMetadata.contentType);
        }
        if (stored.httpMetadata.cacheControl) {
          headers.set("Cache-Control", stored.httpMetadata.cacheControl);
        }
      },
    };
  }

  async get(key) {
    const stored = this.entries.get(key);
    return stored ? this.createObject(key, stored) : null;
  }

  async put(key, value, options) {
    const stored = this.createStoredValue(value, options);
    this.entries.set(key, stored);
    return this.createObject(key, stored, false);
  }

  async delete(key) {
    this.entries.delete(key);
  }

  async list({ cursor, limit }) {
    const keys = [...this.entries.keys()].sort();
    const start = cursor ? Number(cursor) : 0;
    const selected = keys.slice(start, start + limit);
    const next = start + selected.length;
    return {
      objects: selected.map((key) => ({ key })),
      truncated: next < keys.length,
      cursor: next < keys.length ? String(next) : undefined,
    };
  }
}

class MockImages {
  calls = 0;

  input() {
    this.calls += 1;
    return {
      transform: (transformOptions) => ({
        output: async (outputOptions) => ({
          response: () =>
            new Response(
              `thumbnail:${transformOptions.width}:${outputOptions.quality}`,
              { headers: { "Content-Type": outputOptions.format } },
            ),
        }),
      }),
    };
  }
}

class FlakyImages extends MockImages {
  constructor(failures) {
    super();
    this.failures = failures;
  }

  input() {
    this.calls += 1;
    const currentCall = this.calls;

    return {
      transform: (transformOptions) => ({
        output: async (outputOptions) => ({
          response: () =>
            currentCall <= this.failures
              ? new Response("temporarily unavailable", { status: 503 })
              : new Response(
                  `thumbnail:${transformOptions.width}:${outputOptions.quality}`,
                  { headers: { "Content-Type": outputOptions.format } },
                ),
        }),
      }),
    };
  }
}

class DelayedImages extends MockImages {
  active = 0;
  maxActive = 0;

  input() {
    this.calls += 1;

    return {
      transform: (transformOptions) => ({
        output: async (outputOptions) => {
          this.active += 1;
          this.maxActive = Math.max(this.maxActive, this.active);
          await new Promise((resolve) => setTimeout(resolve, 20));
          this.active -= 1;

          return {
            response: () =>
              new Response(
                `thumbnail:${transformOptions.width}:${outputOptions.quality}`,
                { headers: { "Content-Type": outputOptions.format } },
              ),
          };
        },
      }),
    };
  }
}

function createEnv(photoEntries = [], thumbnailEntries = []) {
  return {
    PHOTOS: new MockBucket(photoEntries),
    THUMBNAILS: new MockBucket(thumbnailEntries),
    IMAGES: new MockImages(),
    AUTH_SECRET: "test-secret",
  };
}

function createRequest(path, method = "GET", body) {
  return new Request(`https://thumbnail.example${path}`, {
    method,
    headers: {
      Authorization: "Bearer test-secret",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

test("rejects requests without the shared secret", async () => {
  const response = await worker.fetch(
    new Request("https://thumbnail.example/thumbnail?key=photo.jpg"),
    createEnv(),
  );

  assert.equal(response.status, 401);
});

test("generates a fixed WebP thumbnail and stores it in R2", async () => {
  const env = createEnv([["album/photo.heic", "original-heic"]]);
  const response = await worker.fetch(
    createRequest(
      "/thumbnail?key=album%2Fphoto.heic&variant=gallery",
    ),
    env,
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "image/webp");
  assert.equal(response.headers.get("X-PhotoCloud-Thumbnail"), "MISS");
  assert.equal(await response.text(), "thumbnail:320:50");
  assert.ok(
    env.THUMBNAILS.entries.has(
      getThumbnailKey("album/photo.heic", "gallery"),
    ),
  );
  assert.equal(env.IMAGES.calls, 1);
});

test("serves an existing thumbnail without transforming again", async () => {
  const thumbnailKey = getThumbnailKey("photo.jpg", "gallery");
  const env = createEnv(
    [["photo.jpg", "original"]],
    [[thumbnailKey, "cached-thumbnail"]],
  );
  const response = await worker.fetch(
    createRequest("/thumbnail?key=photo.jpg&variant=gallery"),
    env,
  );

  assert.equal(response.headers.get("X-PhotoCloud-Thumbnail"), "HIT");
  assert.equal(await response.text(), "cached-thumbnail");
  assert.equal(env.IMAGES.calls, 0);
});

test("retries a transient Images failure before returning the thumbnail", async () => {
  const env = createEnv([["photo.jpg", "original"]]);
  env.IMAGES = new FlakyImages(2);
  const response = await worker.fetch(
    createRequest("/thumbnail?key=photo.jpg&variant=gallery"),
    env,
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-PhotoCloud-Thumbnail"), "MISS");
  assert.equal(env.IMAGES.calls, 3);
});

test("limits concurrent first-time thumbnail generations", async () => {
  const entries = Array.from({ length: 6 }, (_, index) => [
    `photo-${index}.jpg`,
    `original-${index}`,
  ]);
  const env = createEnv(entries);
  env.IMAGES = new DelayedImages();

  const responses = await Promise.all(
    entries.map(([key]) =>
      worker.fetch(
        createRequest(`/thumbnail?key=${encodeURIComponent(key)}&variant=gallery`),
        env,
      ),
    ),
  );

  assert.ok(responses.every((response) => response.status === 200));
  assert.equal(env.IMAGES.calls, entries.length);
  assert.ok(env.IMAGES.maxActive <= 2);
});

test("deletes every generated variant for an original", async () => {
  const env = createEnv(
    [],
    [
      [getThumbnailKey("photo.jpg", "gallery"), "gallery"],
      [getThumbnailKey("photo.jpg", "preview"), "preview"],
    ],
  );
  const response = await worker.fetch(
    createRequest("/thumbnail?key=photo.jpg", "DELETE"),
    env,
  );

  assert.equal(response.status, 200);
  assert.equal(env.THUMBNAILS.entries.size, 0);
});

test("backfills supported originals and skips generated objects", async () => {
  const env = createEnv([
    ["family_memo.txt", "memo"],
    ["movie.mp4", "video"],
    ["one.jpg", "one"],
    ["two.heic", "two"],
  ]);
  const response = await worker.fetch(
    createRequest("/backfill", "POST", { limit: 25 }),
    env,
  );
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.processed, 2);
  assert.equal(result.generated, 2);
  assert.equal(result.failed, 0);
});
