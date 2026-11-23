export function isLoopbackHost(host: string): boolean {
  return /^(?:127\.0\.0\.1|localhost|\[::1\])(?::[0-9]{1,5})?$/i.test(host) && host === host.trim();
}
