import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
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
