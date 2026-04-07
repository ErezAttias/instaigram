import { NextResponse } from 'next/server';
import { generateValidationReport } from '@/lib/services/validation-service';
import { handleApiError } from '@/lib/utils/api-helpers';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const report = await generateValidationReport(id);
    return NextResponse.json(report, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
