import { apiError, assertLocal } from '@/lib/api';
import { getReport } from '@/lib/db';

export const runtime = 'nodejs';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertLocal(request);
    const { id } = await params;
    const report = getReport(id);
    if (!report) return Response.json({ error: 'Report not found.' }, { status: 404 });
    return new Response(JSON.stringify(report, null, 2), { headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="packagetruth-${id}.json"`,
      'Cache-Control': 'no-store',
    } });
  } catch (error) { return apiError(error); }
}
