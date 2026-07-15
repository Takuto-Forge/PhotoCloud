const workerUrl = process.env.THUMBNAIL_WORKER_URL?.replace(/\/$/, "");
const workerSecret = process.env.THUMBNAIL_WORKER_SECRET;
const requestedLimit = Number(process.env.THUMBNAIL_BACKFILL_BATCH_SIZE);
const batchSize = Number.isFinite(requestedLimit)
  ? Math.min(Math.max(Math.round(requestedLimit), 1), 25)
  : 10;

if (!workerUrl || !workerSecret) {
  throw new Error(
    "THUMBNAIL_WORKER_URLとTHUMBNAIL_WORKER_SECRETを指定してください．",
  );
}

const endpoint = new URL(workerUrl);
endpoint.pathname = `${endpoint.pathname.replace(/\/$/, "")}/backfill`;

let cursor;
let batch = 0;
let totalGenerated = 0;
let totalCached = 0;
let totalFailed = 0;
const seenCursors = new Set();

do {
  batch += 1;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${workerSecret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ cursor, limit: batchSize }),
  });
  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      `バックフィルに失敗しました（${response.status}）: ${result.error || "不明なエラー"}`,
    );
  }

  totalGenerated += result.generated;
  totalCached += result.cached;
  totalFailed += result.failed;
  console.log(
    `Batch ${batch}: scanned=${result.scanned}, generated=${result.generated}, cached=${result.cached}, failed=${result.failed}`,
  );

  if (result.errors?.length) {
    for (const error of result.errors) {
      console.warn(`  ${error.key}: ${error.error}`);
    }
  }

  cursor = result.cursor || undefined;

  if (result.truncated && !cursor) {
    throw new Error("次のR2カーソルが返されませんでした．");
  }

  if (cursor && seenCursors.has(cursor)) {
    throw new Error("同じR2カーソルが繰り返されたため停止しました．");
  }

  if (cursor) seenCursors.add(cursor);
} while (cursor);

console.log(
  `完了: generated=${totalGenerated}, cached=${totalCached}, failed=${totalFailed}`,
);

if (totalFailed > 0) process.exitCode = 1;
