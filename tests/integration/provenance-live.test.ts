import { describe, expect, it } from 'vitest';
import { scan } from '@packagetruth/scanner';

describe.runIf(process.env.PACKAGETRUTH_LIVE_NPM === '1')('live npm provenance', () => {
  it.each([
    ['semver', '7.5.4', 'https://github.com/npm/node-semver', '36cd334708ec1f85a71445622fb1864bceee0f4e'],
    ['sigstore', '3.1.0', 'https://github.com/sigstore/sigstore-js', '06cd267cbdc2eeaa04294995622db9f6ad2fa7cf'],
    ['@sigstore/verify', '4.1.3', 'https://github.com/sigstore/sigstore-js', '4576519f81b93bf96bd7457fc7252b8cfa11e67f'],
  ])('verifies %s@%s with an exact signed digest and source identity', async (name, version, repository, commit) => {
    const result = await scan(name, version);
    expect(result.checks.integrity.status).toBe('verified');
    expect(result.checks.provenance).toMatchObject({
      status: 'verified', evidence: { repository, commit, sha512: result.artifact.digests.sha512,
        subject: 'pkg:npm/' + name.replace(/^@/, '%40') + '@' + version },
    });
  }, 35_000);
});
