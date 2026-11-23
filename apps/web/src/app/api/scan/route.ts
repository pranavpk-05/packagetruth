import { scan, validateName, validateVersion } from '@packagetruth/scanner';
import { apiError, assertLocal, body, boundedScan } from '@/lib/api';
import { saveReport } from '@/lib/db';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    assertLocal(request);
    const { name, version } = await body(request);
    validateName(name);
    validateVersion(version);
    return await boundedScan(async () => {
      const report = await scan(name, version);
      return Response.json({ id: saveReport(report), report }, { status: 201 });
    });
  } catch (error) { return apiError(error); }
}
