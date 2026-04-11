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
    return NextResponse.json({ error: String(e), cwd, fontsDir });
  }

  // If ?render=1, render a test image with fonts via fontconfig + Sharp
  const url = new URL(request.url);
  if (url.searchParams.get('render') === '1') {
    try {
      const sharp = (await import('sharp')).default;
      const { ensureFontconfigRegistered } = await import('@/lib/visual/font-pairings');

      ensureFontconfigRegistered();

      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200">
        <rect width="400" height="200" fill="#1a1a1f"/>
        <text x="20" y="60" font-family="Inter" font-weight="800" font-size="36" fill="white">Font Test</text>
        <text x="20" y="100" font-family="Inter" font-weight="400" font-size="20" fill="#D0D0D0">Body text in Inter Regular</text>
        <text x="20" y="140" font-family="Montserrat" font-weight="900" font-size="20" fill="#aaa">Montserrat Black</text>
        <text x="20" y="180" font-family="Arial" font-size="14" fill="#666">FONTCONFIG_PATH: ${process.env.FONTCONFIG_PATH || 'not set'}</text>
      </svg>`;

      const image = await sharp(Buffer.from(svg)).png().toBuffer();
      return new NextResponse(image as unknown as BodyInit, {
        headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' },
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
    fontsDir,
    dirExists,
    files,
    fontconfigPath: process.env.FONTCONFIG_PATH || null,
    interRegular: fs.existsSync(path.join(fontsDir, 'Inter-Regular.ttf')),
    interExtraBold: fs.existsSync(path.join(fontsDir, 'Inter-ExtraBold.ttf')),
  });
}
