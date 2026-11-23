import { compare, ScanError, validateName, validateVersion } from '@packagetruth/scanner';
import { apiError, assertLocal, body, boundedScan } from '@/lib/api';
import { saveReport } from '@/lib/db';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    assertLocal(request);
    const { name, before, after } = await body(request);
    validateName(name);
    validateVersion(before);
    validateVersion(after);
    if (before === after) throw new ScanError('INPUT', 'Choose two different versions.');
    return await boundedScan(async () => {
      const report = await compare(name, before, after);
      return Response.json({ id: saveReport(report), report }, { status: 201 });
    });
  } catch (error) { return apiError(error); }
}
