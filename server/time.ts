const DAY = 86_400_000;
export function vietnamDate(now = new Date()) { return new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10); }
export function dateRange(filter: string, now = new Date()): { $gte: Date; $lt: Date } {
  const vnIso = new Date(now.getTime() + 7 * 3_600_000).toISOString();
  const today = new Date(vnIso.slice(0, 10) + 'T00:00:00+07:00');
  let start = today;
  let end = new Date(today.getTime() + DAY);
  if (filter === 'yesterday') { start = new Date(today.getTime() - DAY); end = today; }
  if (filter === '7days') start = new Date(today.getTime() - 6 * DAY);
  if (filter === 'month') {
    const year = parseInt(vnIso.slice(0, 4), 10);
    const month = parseInt(vnIso.slice(5, 7), 10);
    const nextYear = month === 12 ? year + 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    start = new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00+07:00`);
    end = new Date(`${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00+07:00`);
  }
  if (filter === 'all') start = new Date(0);
  return {$gte: start, $lt: end};
}
