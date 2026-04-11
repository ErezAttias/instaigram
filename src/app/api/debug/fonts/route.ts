import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

export async function GET() {
  const cwd = process.cwd();
  const fontsDir = path.join(cwd, 'assets', 'fonts');
  const dirExists = fs.existsSync(fontsDir);
  let files: string[] = [];
  if (dirExists) {
    files = fs.readdirSync(fontsDir);
  }

  return NextResponse.json({
    cwd,
    __dirname,
    fontsDir,
    dirExists,
    files,
    interRegular: fs.existsSync(path.join(fontsDir, 'Inter-Regular.ttf')),
    interExtraBold: fs.existsSync(path.join(fontsDir, 'Inter-ExtraBold.ttf')),
  });
}
