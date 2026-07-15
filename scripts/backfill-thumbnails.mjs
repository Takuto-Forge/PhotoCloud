const workerUrl = process.env.THUMBNAIL_WORKER_URL?.replace(/\/$/, "");
const workerSecret = process.env.THUMBNAIL_WORKER_SECRET;
const requestedLimit = Number(process.env.THUMBNAIL_BACKFILL_BATCH_SIZE);
const batchSize = Number.isFinite(requestedLimit)
  ? Math.min(Math.max(Math.round(requestedLimit), 1), 25)
  : 10;
const MAX_REQUEST_ATTEMPTS = 8;
const RETRY_BASE_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 30_000;
const BATCH_PAUSE_MS = 300;
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

if (!workerUrl || !workerSecret) {
  throw new Error(
    "THUMBNAIL_WORKER_URLとTHUMBNAIL_WORKER_SECRETを指定してください．",
  );
}

const endpoint = new URL(workerUrl);
endpoint.pathname = `${endpoint.pathname.replace(/\/$/, "")}/backfill`;

class BackfillRequestError extends Error {
  constructor(message, retryable) {
    super(message);
    this.retryable = retryable;
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function requestBackfillBatch(cursor) {
  let response;

  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${workerSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ cursor, limit: batchSize }),
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : "不明な通信エラー";
    throw new BackfillRequestError(`Workerへの接続に失敗しました: ${details}`, true);
  }

  let responseText;

  try {
    responseText = await response.text();
  } catch (error) {
    const details = error instanceof Error ? error.message : "不明な通信エラー";
    throw new BackfillRequestError(
      `Workerの応答を読み取れませんでした: ${details}`,
      true,
    );
  }
  let result;

  try {
    result = JSON.parse(responseText);
  } catch {
    const preview = responseText.replace(/\s+/g, " ").trim().slice(0, 100);
    const details = preview ? `: ${preview}` : "";
    throw new BackfillRequestError(
      `WorkerからJSONではない応答が返りました（HTTP ${response.status}）${details}`,
      response.ok || RETRYABLE_STATUSES.has(response.status),
    );
  }

  if (!response.ok) {
    throw new BackfillRequestError(
      `バックフィルに失敗しました（${response.status}）: ${result.error || "不明なエラー"}`,
      RETRYABLE_STATUSES.has(response.status),
    );
  }

  return result;
}

async function requestBackfillBatchWithRetry(cursor) {
  for (let attempt = 1; attempt <= MAX_REQUEST_ATTEMPTS; attempt += 1) {
    try {
      return await requestBackfillBatch(cursor);
    } catch (error) {
      const retryable =
        error instanceof BackfillRequestError && error.retryable;

      if (!retryable || attempt === MAX_REQUEST_ATTEMPTS) throw error;

      const retryDelay = Math.min(
        RETRY_BASE_DELAY_MS * 2 ** (attempt - 1),
        MAX_RETRY_DELAY_MS,
      );
      const details = error instanceof Error ? error.message : "不明なエラー";
      console.warn(
        `一時エラー: ${details}．${retryDelay / 1_000}秒後に再試行します（${attempt}/${MAX_REQUEST_ATTEMPTS}）`,
      );
      await delay(retryDelay);
    }
  }

  throw new Error("バックフィルの再試行回数を超えました．");
}

let cursor;
let batch = 0;
let totalGenerated = 0;
let totalCached = 0;
let totalFailed = 0;
const seenCursors = new Set();

do {
  batch += 1;
  const result = await requestBackfillBatchWithRetry(cursor);

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
  if (cursor) await delay(BATCH_PAUSE_MS);
} while (cursor);

console.log(
  `完了: generated=${totalGenerated}, cached=${totalCached}, failed=${totalFailed}`,
);

if (totalFailed > 0) process.exitCode = 1;
