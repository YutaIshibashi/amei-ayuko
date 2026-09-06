/** Formatting helpers. Everything is Asia/Tokyo. */

const JPY = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0,
});

export function formatPrice(value: number): string {
  return JPY.format(value);
}

/** `2026-09-06 10:00:00` / ISO → `2026.09.06` */
export function formatDate(input: string): string {
  const d = parseDate(input);
  if (!d) return '';
  const p = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (t: Intl.DateTimeFormatPartTypes) => p.find((x) => x.type === t)?.value ?? '';
  return `${get('year')}.${get('month')}.${get('day')}`;
}

/** ISO 8601 with the JST offset, for <time datetime> and JSON-LD. */
export function toIsoJst(input: string): string {
  const d = parseDate(input);
  if (!d) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((x) => x.type === t)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}+09:00`;
}

/** MySQL DATETIME strings have no timezone; treat them as JST. */
function parseDate(input: string): Date | null {
  if (!input) return null;
  const mysql = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(input);
  const iso = mysql
    ? `${mysql[1]}-${mysql[2]}-${mysql[3]}T${mysql[4]}:${mysql[5]}:${mysql[6] ?? '00'}+09:00`
    : input;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Absolute URL for canonical / OGP / share targets. */
export function absoluteUrl(path: string, origin: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${origin.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

export function truncate(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}
