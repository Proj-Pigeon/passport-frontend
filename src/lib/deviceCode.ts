export function normalizeDeviceCode(value: string): string {
  return value.toUpperCase().replace(/[\s-]/g, '').slice(0, 8);
}
