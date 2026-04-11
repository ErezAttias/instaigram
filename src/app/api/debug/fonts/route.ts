import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const fs = await import('fs');
  const path = await import('path');

  const cwd = process.cwd();
  const fontsDir = path.join(cwd, 'assets', 'fonts');

  let dirExists = false;
  let files: string[] = [];
  try {
    dirExists = fs.existsSync(fontsDir);
    if (dirExists) {
      files = fs.readdirSync(fontsDir).map(f => String(f));
    }
  } catch (e: unknown) {
    return NextResponse.json({
      error: String(e),
      cwd,
      dirname: __dirname,
      fontsDir,
    });
  }

  // If ?render=1, actually render a test image with embedded fonts via Sharp
  const url = new URL(request.url);
  if (url.searchParams.get('render') === '1') {
    try {
      const sharp = (await import('sharp')).default;
      const { buildFontStyleBlock, getTitleFont, getBodyFont } = await import('@/lib/visual/font-pairings');

      const titleFont = getTitleFont('inter');
      const bodyFont = getBodyFont('inter');
      const fontBlock = buildFontStyleBlock(titleFont, bodyFont, true);

      const fontBlockLength = fontBlock.length;
      const hasStyle = fontBlock.includes('<style>');
      const hasFontFace = fontBlock.includes('@font-face');

      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200">
        <defs>${fontBlock}</defs>
        <rect width="400" height="200" fill="#1a1a1f"/>
        <text x="20" y="60" font-family="'Inter'" font-weight="800" font-size="36" fill="white">Font Test</text>
        <text x="20" y="100" font-family="'Inter'" font-weight="400" font-size="20" fill="#D0D0D0">Body text in Inter Regular</text>
        <text x="20" y="140" font-family="Arial" font-size="16" fill="#888888">Arial fallback comparison</text>
        <text x="20" y="180" font-size="14" fill="#666666">fontBlock: ${fontBlockLength} chars, style: ${hasStyle}, fontFace: ${hasFontFace}</text>
      </svg>`;

      const image = await sharp(Buffer.from(svg)).png().toBuffer();
      return new NextResponse(image, {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'no-store',
        },
      });
    } catch (e: unknown) {
      return NextResponse.json({
        renderError: String(e),
        stack: e instanceof Error ? e.stack : undefined,
      }, { status: 500 });
    }
  }

  return NextResponse.json({
    cwd,
    dirname: __dirname,
    fontsDir,
    dirExists,
    files,
    interRegular: fs.existsSync(path.join(fontsDir, 'Inter-Regular.ttf')),
    interExtraBold: fs.existsSync(path.join(fontsDir, 'Inter-ExtraBold.ttf')),
  });
}
