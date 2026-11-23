export class ScanError extends Error {
  constructor(public readonly code: 'INPUT' | 'REGISTRY' | 'NOT_FOUND' | 'LIMIT' | 'ARCHIVE', message: string) {
    super(message);
    this.name = 'ScanError';
  }
}

const namePart = '[a-zA-Z0-9][a-zA-Z0-9._~-]*';
const packagePattern = new RegExp(`^(?:@${namePart}/)?${namePart}$`);
const numeric = '(?:0|[1-9][0-9]*)';
const pre = `(?:${numeric}|[0-9]*[a-zA-Z-][0-9a-zA-Z-]*)`;
const exactVersion = new RegExp(`^${numeric}\\.${numeric}\\.${numeric}(?:-${pre}(?:\\.${pre})*)?(?:\\+[0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*)?$`);

export function validateName(name: unknown): asserts name is string {
  if (typeof name !== 'string' || name.length > 214 || /\s/.test(name) || !packagePattern.test(name)) {
    throw new ScanError('INPUT', 'Enter an npm package name, such as lodash or @types/node.');
  }
}

export function validateVersion(version: unknown): asserts version is string {
  if (typeof version !== 'string' || version.length > 100 || /\s/.test(version) || !exactVersion.test(version)) {
    throw new ScanError('INPUT', 'Enter an exact SemVer version, such as 4.17.21. Tags and ranges are unsupported.');
  }
}

export function parseSpec(spec: string): { name: string; version: string } {
  const index = spec.lastIndexOf('@');
  const name = spec.slice(0, index < 1 ? 0 : index);
  const version = spec.slice(index + 1);
  validateName(name);
  validateVersion(version);
  return { name, version };
}

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}
