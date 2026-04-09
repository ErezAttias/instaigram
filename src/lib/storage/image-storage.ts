import fs from 'fs';
import path from 'path';

const LOCAL_DIR = path.join(process.cwd(), 'public', 'carousel-images');

// Lazy-initialised R2 client — only created when all env vars are present
let r2: import('@aws-sdk/client-s3').S3Client | null | undefined;

function getR2Client() {
  if (r2 !== undefined) return r2;

  const {
    CLOUDFLARE_R2_ACCESS_KEY_ID,
    CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    CLOUDFLARE_R2_ACCOUNT_ID,
    CLOUDFLARE_R2_BUCKET_NAME,
  } = process.env;

  if (
    !CLOUDFLARE_R2_ACCESS_KEY_ID ||
    !CLOUDFLARE_R2_SECRET_ACCESS_KEY ||
    !CLOUDFLARE_R2_ACCOUNT_ID ||
    !CLOUDFLARE_R2_BUCKET_NAME
  ) {
    r2 = null;
    return null;
  }

  // Dynamic import to avoid loading the SDK when not needed
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { S3Client } = require('@aws-sdk/client-s3');
  r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: CLOUDFLARE_R2_ACCESS_KEY_ID,
      secretAccessKey: CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    },
  });
  return r2;
}

/**
 * Save a slide image. Returns a public URL.
 * - With R2 env vars: uploads to Cloudflare R2, returns the public R2 URL.
 * - Without R2 env vars: writes to public/carousel-images/, returns a local path.
 */
export async function saveImage(
  jobId: string,
  slideIndex: number,
  imageBase64: string,
): Promise<string> {
  const buffer = Buffer.from(imageBase64, 'base64');
  const key = `carousel-images/${jobId}/${slideIndex}.png`;
  const client = getR2Client();

  if (client) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    await client.send(
      new PutObjectCommand({
        Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: 'image/png',
      }),
    );
    return `${process.env.CLOUDFLARE_R2_PUBLIC_URL}/${key}`;
  }

  // Local fallback
  const dir = path.join(LOCAL_DIR, jobId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${slideIndex}.png`), buffer);
  return `/${key}`;
}
