/**
 * One-time migration: extract base64 images from DB and save to public/carousel-images/
 * Run with: npx tsx scripts/migrate-images-to-disk.ts
 */

import fs from 'fs';
import path from 'path';
import { config } from 'dotenv';
import { Client } from 'pg';

config({ path: '.env.local' });

const OUT_DIR = path.join(process.cwd(), 'public', 'carousel-images');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log('Counting slides with base64 images...');
  const countRes = await client.query(`SELECT COUNT(*) FROM "CarouselSlide" WHERE "imageUrl" LIKE 'data:%'`);
  const total = parseInt(countRes.rows[0].count);
  console.log(`Found ${total} slides to migrate.`);

  if (total === 0) {
    console.log('Nothing to do.');
    await client.end();
    return;
  }

  // Fetch IDs first (fast), then fetch each blob individually
  const idsRes = await client.query<{ id: string; carouselJobId: string; slideIndex: number }>(
    `SELECT id, "carouselJobId", "slideIndex" FROM "CarouselSlide" WHERE "imageUrl" LIKE 'data:%' ORDER BY id`
  );

  let migrated = 0;
  let failed = 0;

  for (const row of idsRes.rows) {
    try {
      // Fetch one image at a time
      const imgRes = await client.query<{ imageUrl: string }>(
        `SELECT "imageUrl" FROM "CarouselSlide" WHERE id = $1`,
        [row.id]
      );
      const imageUrl = imgRes.rows[0]?.imageUrl;
      if (!imageUrl?.startsWith('data:')) { failed++; continue; }

      const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) { failed++; continue; }

      const b64 = match[2];
      const dir = path.join(OUT_DIR, row.carouselJobId);
      fs.mkdirSync(dir, { recursive: true });
      const filePath = path.join(dir, `${row.slideIndex}.png`);
      fs.writeFileSync(filePath, Buffer.from(b64, 'base64'));

      const fileUrl = `/carousel-images/${row.carouselJobId}/${row.slideIndex}.png`;
      await client.query(`UPDATE "CarouselSlide" SET "imageUrl" = $1 WHERE id = $2`, [fileUrl, row.id]);

      migrated++;
      console.log(`  [${migrated}/${total}] ${row.carouselJobId}/${row.slideIndex}.png`);
    } catch (err) {
      console.error(`  ✗ ${row.id}: ${err}`);
      failed++;
    }
  }

  await client.end();
  console.log(`\nDone. Migrated: ${migrated}, Failed: ${failed}`);
}

main().catch(console.error);
