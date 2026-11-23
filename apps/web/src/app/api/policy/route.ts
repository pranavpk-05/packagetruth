import { ScanError } from '@packagetruth/scanner';
import { severities } from '@packagetruth/shared';
import type { Severity } from '@packagetruth/shared';
import { apiError, assertLocal, body } from '@/lib/api';
import { setPolicy } from '@/lib/db';

export const runtime = 'nodejs';
export async function PUT(request: Request) {
  try {
    assertLocal(request);
    const { threshold } = await body(request);
    if (threshold !== 'off' && !severities.includes(threshold as Severity)) throw new ScanError('INPUT', 'Choose a valid severity.');
    setPolicy(threshold as Severity | 'off');
    return Response.json({ threshold });
  } catch (error) { return apiError(error); }
}
