import { describe, expect, it } from 'vitest';
import { parseSpec, validateName, validateVersion } from '@packagetruth/scanner';
import { displayEvidence, meetsPolicy } from '@packagetruth/shared';
import type { Finding } from '@packagetruth/shared';

describe('release input', () => {
  it('parses scoped and unscoped exact releases', () => {
    expect(parseSpec('@types/node@24.0.0-rc.1+build.1')).toEqual({ name: '@types/node', version: '24.0.0-rc.1+build.1' });
    expect(parseSpec('lodash@4.17.21')).toEqual({ name: 'lodash', version: '4.17.21' });
  });
  it.each(['', 'foo/bar', '@foo', '../a', '@a/../b', 'http://a', 'x%2Fy', 'x\n'])('rejects name %j', name => {
    expect(() => validateName(name)).toThrow(/package name/);
  });
  it.each(['01.2.3', '1.2', 'latest', '^1.2.3', 'v1.2.3', '1.2.3-01', '1.2.3\n'])('rejects version %j', version => {
    expect(() => validateVersion(version)).toThrow(/exact SemVer/);
  });
  it('thresholds use severity and can be disabled', () => {
    const findings: Finding[] = [{ severity: 'high', ruleId: 'sample', path: '', evidence: '', explanation: '', action: '' }];
    expect(meetsPolicy(findings, 'medium')).toBe(true);
    expect(meetsPolicy(findings, 'critical')).toBe(false);
    expect(meetsPolicy(findings, 'off')).toBe(false);
  });
  it('renders terminal escapes and bidi controls visibly', () => {
    expect(displayEvidence('a\u001b\u202eb\n')).toBe('a\\u001b\\u202eb\\u000a');
    expect(displayEvidence('a\nb', true)).toBe('a\nb');
  });
});
