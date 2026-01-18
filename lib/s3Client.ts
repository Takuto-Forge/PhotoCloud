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
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  },
  // お昼に解決した大事な設定！
  forcePathStyle: true, 

  // ⚡️ Cloudflareの本番環境（Edge）で DOMParser エラーを出さないための魔法
  requestHandler: {
    handle: (request: any) => {
      const url = `${request.protocol}//${request.hostname}${request.path}`;
      return fetch(url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
      }).then((response) => 
        response.arrayBuffer().then((body) => ({
          response: {
            statusCode: response.status,
            headers: Object.fromEntries(response.headers.entries()),
            body: new Uint8Array(body),
          },
        }))
      );
    },
  },
});