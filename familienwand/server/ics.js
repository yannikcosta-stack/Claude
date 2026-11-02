// Minimaler iCalendar-Leser (RFC 5545) für Abo-Links (z. B. Kita, Schule, Müllabfuhr,
// oder die „geheime iCal-Adresse“ eines Google-Kalenders). Unterstützt gängige RRULEs.
import { zonedToUtc, isValidTz } from './tz.js';

const WIN_TZ = {
  'W. Europe Standard Time': 'Europe/Berlin', 'Central Europe Standard Time': 'Europe/Budapest',
  'Romance Standard Time': 'Europe/Paris', 'GMT Standard Time': 'Europe/London', 'UTC': 'UTC',
  'Central European Standard Time': 'Europe/Warsaw', 'E. Europe Standard Time': 'Europe/Chisinau',
};

function unfold(text) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}

function unescapeText(s) {
  return s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
}

function parseLine(line) {
  // NAME;PARAM=a;PARAM2="b:c":VALUE
  let i = 0, inQ = false;
  for (; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQ = !inQ;
    else if (c === ':' && !inQ) break;
  }
  const head = line.slice(0, i), value = line.slice(i + 1);
  const parts = head.split(';');
  const params = {};
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name: parts[0].toUpperCase(), params, value };
}

/** Liefert { kind:'date', y,m,d } oder { kind:'time', utc:Date } bzw. 'local' mit tz */
function parseDt(value, params, defTz) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (params.VALUE === 'DATE' || h === undefined) return { kind: 'date', y: +y, m: +mo, d: +d };
  if (z) return { kind: 'time', utc: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s || 0))), tz: 'UTC', wall: { y: +y, m: +mo, d: +d, h: +h, mi: +mi, s: +(s || 0) } };
  let tz = params.TZID ? (WIN_TZ[params.TZID] || params.TZID) : defTz;
  if (!isValidTz(tz)) tz = defTz;
  const wall = { y: +y, m: +mo, d: +d, h: +h, mi: +mi, s: +(s || 0) };
  return { kind: 'time', utc: zonedToUtc(wall.y, wall.m, wall.d, wall.h, wall.mi, wall.s, tz), tz, wall };
}

function parseDuration(v) {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v.trim());
  if (!m) return 0;
  const sign = m[1] === '-' ? -1 : 1;
  return sign * ((+(m[2] || 0) * 7 + +(m[3] || 0)) * 86400 + +(m[4] || 0) * 3600 + +(m[5] || 0) * 60 + +(m[6] || 0)) * 1000;
}

const pad = (n) => String(n).padStart(2, '0');
const ymdStr = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const dayNum = (y, m, d) => Math.round(Date.UTC(y, m - 1, d) / 86400000);
const fromDayNum = (n) => { const t = new Date(n * 86400000); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }; };
const WD = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

function parseRule(v) {
  const r = {};
  for (const part of v.split(';')) {
    const [k, val] = part.split('=');
    if (k) r[k.toUpperCase()] = val;
  }
  return r;
}

/** Erzeugt Ortsdaten (y,m,d) der Wiederholungen ab dtstart bis maxDay (Tagnummer). */
function* expandDates(rule, start, maxDay, untilDay) {
  const freq = rule.FREQ;
  const interval = Math.max(1, parseInt(rule.INTERVAL || '1', 10));
  const byday = rule.BYDAY ? rule.BYDAY.split(',').map((x) => {
    const mm = /^([+-]?\d+)?(MO|TU|WE|TH|FR|SA|SU)$/.exec(x.trim());
    return mm ? { n: mm[1] ? parseInt(mm[1], 10) : 0, wd: WD[mm[2]] } : null;
  }).filter(Boolean) : null;
  const bymonthday = rule.BYMONTHDAY ? rule.BYMONTHDAY.split(',').map(Number) : null;
  const bymonth = rule.BYMONTH ? rule.BYMONTH.split(',').map(Number) : null;
  const startDay = dayNum(start.y, start.m, start.d);
  const end = Math.min(maxDay, untilDay === null ? Infinity : untilDay);
  let guard = 0;

  const monthDays = (y, m) => {
    const dim = daysInMonth(y, m);
    let days = [];
    if (byday) {
      for (const b of byday) {
        const all = [];
        for (let d = 1; d <= dim; d++) if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() === b.wd) all.push(d);
        if (b.n === 0) days.push(...all);
        else if (b.n > 0 && all[b.n - 1]) days.push(all[b.n - 1]);
        else if (b.n < 0 && all[all.length + b.n]) days.push(all[all.length + b.n]);
      }
    } else if (bymonthday) {
      for (const n of bymonthday) {
        const d = n > 0 ? n : dim + n + 1;
        if (d >= 1 && d <= dim) days.push(d);
      }
    } else if (start.d <= dim) days.push(start.d);
    return [...new Set(days)].sort((a, b) => a - b);
  };

  if (freq === 'DAILY') {
    for (let n = startDay; n <= end && guard++ < 20000; n += interval) {
      const dt = fromDayNum(n);
      if (bymonth && !bymonth.includes(dt.m)) continue;
      if (byday && !byday.some((b) => b.wd === new Date(n * 86400000).getUTCDay())) continue;
      yield dt;
    }
  } else if (freq === 'WEEKLY') {
    const wds = byday ? byday.map((b) => b.wd) : [new Date(startDay * 86400000).getUTCDay()];
    // Wochenbeginn Montag
    const startDow = (new Date(startDay * 86400000).getUTCDay() + 6) % 7;
    let weekStart = startDay - startDow;
    for (; weekStart <= end && guard++ < 5000; weekStart += 7 * interval) {
      const days = wds.map((wd) => weekStart + ((wd + 6) % 7)).sort((a, b) => a - b);
      for (const n of days) if (n >= startDay && n <= end) yield fromDayNum(n);
    }
  } else if (freq === 'MONTHLY') {
    let y = start.y, m = start.m;
    while (guard++ < 2400) {
      if (dayNum(y, m, 1) > end) break;
      if (!bymonth || bymonth.includes(m)) {
        for (const d of monthDays(y, m)) {
          const n = dayNum(y, m, d);
          if (n >= startDay && n <= end) yield { y, m, d };
        }
      }
      m += interval;
      while (m > 12) { m -= 12; y++; }
    }
  } else if (freq === 'YEARLY') {
    let y = start.y;
    while (guard++ < 300) {
      if (dayNum(y, 1, 1) > end) break;
      const months = bymonth || [start.m];
      for (const m of months) {
        const days = byday || bymonthday ? monthDays(y, m) : (start.d <= daysInMonth(y, m) ? [start.d] : []);
        for (const d of days) {
          const n = dayNum(y, m, d);
          if (n >= startDay && n <= end) yield { y, m, d };
        }
      }
      y += interval;
    }
  } else {
    yield start;
  }
}

/**
 * Parst einen ICS-Text und liefert Termine im Fenster [from, to] (Date-Objekte).
 * Termine: { id, title, allDay, start, end, location, notes }
 */
export function parseIcs(text, { from, to, tz = 'Europe/Berlin' }) {
  const lines = unfold(text);
  const events = [];
  let cur = null, depth = 0;
  for (const raw of lines) {
    if (!raw) continue;
    const { name, params, value } = parseLine(raw);
    if (name === 'BEGIN' && value.toUpperCase() === 'VEVENT') { cur = { exdates: [] }; depth = 0; continue; }
    if (!cur) continue;
    if (name === 'BEGIN') { depth++; continue; } // z. B. VALARM überspringen
    if (name === 'END' && value.toUpperCase() !== 'VEVENT') { depth--; continue; }
    if (name === 'END') { events.push(cur); cur = null; continue; }
    if (depth > 0) continue;
    switch (name) {
      case 'UID': cur.uid = value; break;
      case 'SUMMARY': cur.title = unescapeText(value); break;
      case 'LOCATION': cur.location = unescapeText(value); break;
      case 'DESCRIPTION': cur.notes = unescapeText(value); break;
      case 'STATUS': cur.status = value.toUpperCase(); break;
      case 'DTSTART': cur.start = parseDt(value, params, tz); break;
      case 'DTEND': cur.end = parseDt(value, params, tz); break;
      case 'DURATION': cur.duration = parseDuration(value); break;
      case 'RRULE': cur.rrule = parseRule(value); break;
      case 'RECURRENCE-ID': cur.recurrenceId = parseDt(value, params, tz); break;
      case 'EXDATE':
        for (const v of value.split(',')) { const d = parseDt(v, params, tz); if (d) cur.exdates.push(d); }
        break;
      default: break;
    }
  }

  const key = (dt) => (dt.kind === 'date' ? ymdStr(dt.y, dt.m, dt.d) : dt.utc.toISOString());
  const overrides = new Set(events.filter((e) => e.recurrenceId).map((e) => `${e.uid}|${key(e.recurrenceId)}`));
  const out = [];
  const fromDay = dayNum(from.getUTCFullYear(), from.getUTCMonth() + 1, from.getUTCDate()) - 1;
  const toDay = dayNum(to.getUTCFullYear(), to.getUTCMonth() + 1, to.getUTCDate()) + 1;

  for (const e of events) {
    if (!e.start || e.status === 'CANCELLED') continue;
    const allDay = e.start.kind === 'date';
    const title = e.title || '(ohne Titel)';
    const base = { title, allDay, location: e.location || '', notes: e.notes || '' };
    // Dauer
    let durMs, durDays;
    if (allDay) {
      durDays = e.end && e.end.kind === 'date' ? dayNum(e.end.y, e.end.m, e.end.d) - dayNum(e.start.y, e.start.m, e.start.d) : (e.duration ? Math.round(e.duration / 86400000) : 1);
      if (durDays < 1) durDays = 1;
    } else {
      durMs = e.end && e.end.kind === 'time' ? e.end.utc - e.start.utc : (e.duration || 0);
      if (durMs < 0) durMs = 0;
    }
    const emit = (dateParts, id) => {
      if (allDay) {
        const s = dayNum(dateParts.y, dateParts.m, dateParts.d);
        if (s + durDays < fromDay || s > toDay) return;
        const se = fromDayNum(s + durDays);
        out.push({ ...base, id, start: ymdStr(dateParts.y, dateParts.m, dateParts.d), end: ymdStr(se.y, se.m, se.d) });
      } else {
        const w = e.start.wall;
        const st = e.start.tz === 'UTC' && !e.rrule ? e.start.utc : zonedToUtc(dateParts.y, dateParts.m, dateParts.d, w.h, w.mi, w.s, e.start.tz);
        const en = new Date(st.getTime() + durMs);
        if (en < from || st > to) return;
        out.push({ ...base, id, start: st.toISOString(), end: en.toISOString() });
      }
    };

    if (e.recurrenceId || !e.rrule) {
      const p = allDay ? e.start : e.start.wall;
      emit({ y: p.y, m: p.m, d: p.d }, `${e.uid || title}|${key(e.recurrenceId || e.start)}`);
      continue;
    }
    // Wiederholung
    const startWall = allDay ? e.start : e.start.wall;
    let untilDay = null;
    if (e.rrule.UNTIL) {
      const u = parseDt(e.rrule.UNTIL, {}, e.start.tz || tz);
      if (u) {
        if (u.kind === 'date') untilDay = dayNum(u.y, u.m, u.d);
        else { const w = u.kind === 'time' && e.start.tz ? u.wall : u.wall; untilDay = dayNum(w.y, w.m, w.d); }
      }
    }
    const count = e.rrule.COUNT ? parseInt(e.rrule.COUNT, 10) : Infinity;
    const ex = new Set(e.exdates.map((d) => (d.kind === 'date' ? ymdStr(d.y, d.m, d.d) : null)).filter(Boolean));
    const exT = new Set(e.exdates.filter((d) => d.kind === 'time').map((d) => d.utc.getTime()));
    let i = 0;
    for (const dp of expandDates(e.rrule, { y: startWall.y, m: startWall.m, d: startWall.d }, toDay, untilDay)) {
      if (i++ >= count) break;
      const ds = ymdStr(dp.y, dp.m, dp.d);
      let k;
      if (allDay) {
        if (ex.has(ds)) continue;
        k = ds;
      } else {
        const w = e.start.wall;
        const st = zonedToUtc(dp.y, dp.m, dp.d, w.h, w.mi, w.s, e.start.tz);
        if (exT.has(st.getTime()) || ex.has(ds)) continue;
        k = st.toISOString();
      }
      if (overrides.has(`${e.uid}|${k}`)) continue;
      emit(dp, `${e.uid || title}|${k}`);
    }
  }
  out.sort((a, b) => (a.start < b.start ? -1 : 1));
  return out;
}
