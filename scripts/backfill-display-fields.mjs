/**
 * Backfill displayTitle + displaySupport for all slides that have headline
 * but are missing compressed display fields.
 *
 * Uses a deterministic heuristic (no AI calls) that mirrors the compression rules:
 * - displayTitle:   first ≤10 words from headline, trimmed
 * - displaySupport: first sentence of body (≤15 words), trimmed
 *
 * Run: node scripts/backfill-display-fields.mjs [--dry-run]
 */

import pg from 'pg';
const { Client } = pg;

const DRY_RUN = process.argv.includes('--dry-run');

const client = new Client({
  connectionString:
    process.env.DATABASE_URL ||
    'postgresql://user:password@localhost:5432/instaigram',
});

/** Extract first N words, clean fluff */
function compressTitle(headline) {
  if (!headline) return null;
  // Remove common fluff prefixes
  let text = headline
    .replace(/^(Here'?s?\s+(the\s+)?(thing|truth|reality)\s*[:—–-]\s*)/i, '')
    .replace(/^(Most people don'?t know\s+(that\s+)?)/i, '')
    .replace(/^(Did you know\s+(that\s+)?)/i, '')
    .replace(/^(The truth is\s*,?\s*)/i, '')
    .trim();

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= 10) return text;
  return words.slice(0, 10).join(' ');
}

/** Extract first sentence from body, up to 15 words, removing fluff */
function compressSupport(body) {
  if (!body || body.trim() === '') return '';
  // Take first sentence
  let text = body.split(/(?<=[.!?])\s+/)[0] || body;
  // Remove fluff openers
  text = text
    .replace(/^(This\s+(means|is|shows|suggests|reveals|demonstrates)\s+(that\s+)?)/i, '')
    .replace(/^(In\s+(fact|reality|other words)\s*,?\s*)/i, '')
    .trim();
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= 15) return text.replace(/\.$/, '');
  return words.slice(0, 15).join(' ');
}

async function main() {
  await client.connect();

  // Count slides needing backfill
  const countResult = await client.query(`
    SELECT COUNT(*) as cnt
    FROM "Slide"
    WHERE headline IS NOT NULL
      AND "displayTitle" IS NULL
  `);

  const total = parseInt(countResult.rows[0].cnt, 10);
  console.log(`Slides needing backfill: ${total}`);

  if (total === 0) {
    console.log('Nothing to backfill.');
    await client.end();
    return;
  }

  if (DRY_RUN) {
    // Show a sample
    const sample = await client.query(`
      SELECT id, "slideIndex", role, headline, LEFT(body, 120) as body_preview
      FROM "Slide"
      WHERE headline IS NOT NULL AND "displayTitle" IS NULL
      LIMIT 3
    `);
    for (const row of sample.rows) {
      const dt = compressTitle(row.headline);
      const ds = compressSupport(row.body_preview);
      console.log(`\n  Slide ${row.slideIndex} (${row.role}):`);
      console.log(`    headline:       ${row.headline}`);
      console.log(`    displayTitle:   ${dt}`);
      console.log(`    displaySupport: ${ds}`);
    }
    console.log(`\n[DRY RUN] Would update ${total} slides. Run without --dry-run to apply.`);
    await client.end();
    return;
  }

  // Fetch all slides needing backfill
  const slides = await client.query(`
    SELECT id, headline, body
    FROM "Slide"
    WHERE headline IS NOT NULL AND "displayTitle" IS NULL
  `);

  let updated = 0;
  for (const row of slides.rows) {
    const displayTitle = compressTitle(row.headline);
    const displaySupport = compressSupport(row.body);

    if (displayTitle) {
      await client.query(
        `UPDATE "Slide" SET "displayTitle" = $1, "displaySupport" = $2, "updatedAt" = NOW() WHERE id = $3`,
        [displayTitle, displaySupport || '', row.id]
      );
      updated++;
    }
  }

  console.log(`Backfilled ${updated} slides.`);

  // Verify
  const verify = await client.query(`
    SELECT COUNT(*) as cnt FROM "Slide" WHERE "displayTitle" IS NULL AND headline IS NOT NULL
  `);
  console.log(`Remaining without displayTitle: ${verify.rows[0].cnt}`);

  await client.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
