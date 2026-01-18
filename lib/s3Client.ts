// import { S3Client } from "@aws-sdk/client-s3";

// export const r2 = new S3Client({
//   region: "auto", 
//   endpoint: process.env.R2_ENDPOINT,
//   credentials: {
//     accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
//     secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
//   },
//   // R2では基本的にこれが推奨されるよ
//   forcePathStyle: true,
// });

import { S3Client } from "@aws-sdk/client-s3";

export const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  },
  // --- ここを追加 ---
  // Edge RuntimeでXML解析や署名計算が正しく動くように調整
  forcePathStyle: true,
});