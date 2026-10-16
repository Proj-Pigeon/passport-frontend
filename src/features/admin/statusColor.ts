export function statusColor(status: number): string {
  if (status >= 500) return 'red';
  if (status >= 400) return 'yellow';
  if (status >= 200 && status < 300) return 'green';
  return 'gray';
}
