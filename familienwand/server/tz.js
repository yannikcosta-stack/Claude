// Zeitzonen-Helfer ohne externe Bibliotheken (nutzt Intl, in Node mit full-icu enthalten).

const fmtCache = new Map();
function dtf(tz) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

export function isValidTz(tz) {
  try { dtf(tz); return true; } catch { return false; }
}

/** Ortszeit-Bestandteile eines Zeitpunkts in einer Zeitzone. */
export function localParts(date, tz) {
  const p = {};
  for (const x of dtf(tz).formatToParts(date)) p[x.type] = x.value;
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second };
}

/** Abstand Ortszeit − UTC in Minuten zum Zeitpunkt `date`. */
export function tzOffsetMin(date, tz) {
  const p = localParts(date, tz);
  const asUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/** Wandzeit (Ortszeit in tz) → echter Zeitpunkt. */
export function zonedToUtc(y, mo, d, h = 0, mi = 0, s = 0, tz = 'UTC') {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  const off1 = tzOffsetMin(new Date(guess), tz);
  let t = guess - off1 * 60000;
  const off2 = tzOffsetMin(new Date(t), tz);
  if (off2 !== off1) t = guess - off2 * 60000;
  return new Date(t);
}

const pad = (n) => String(n).padStart(2, '0');

/** 'YYYY-MM-DDTHH:mm[:ss]' (Ortszeit) → Date */
export function naiveToUtc(naive, tz) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(naive);
  if (!m) return null;
  return zonedToUtc(+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] || 0), tz);
}

/** Date → 'YYYY-MM-DD' in tz */
export function ymdInTz(date, tz) {
  const p = localParts(date, tz);
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}`;
}

/** Date → 'YYYY-MM-DDTHH:mm:ss' Ortszeit in tz */
export function naiveInTz(date, tz) {
  const p = localParts(date, tz);
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}:${pad(p.s)}`;
}

export function addDaysYmd(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function isYmd(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}
