// Termine lesen, schreiben und synchronisieren – unabhängig von der Quelle.
import { getDb, getCache, save, newId, readServiceAccount } from './store.js';
import * as google from './google.js';
import { parseIcs } from './ics.js';
import { naiveToUtc, addDaysYmd, ymdInTz, isYmd, zonedToUtc } from './tz.js';

const SYNC_PAST_DAYS = 31;
const SYNC_FUTURE_DAYS = 200;
const syncing = new Map();
const listeners = new Set();
/** Benachrichtigt verbundene Geräte (Wand, Handys) sofort über Änderungen. */
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function emitChange(reason) { for (const fn of listeners) { try { fn(reason); } catch { /* egal */ } } }

export const tz = () => getDb().settings.timezone || 'Europe/Berlin';

export function calendarById(id) {
  return getDb().calendars.find((c) => c.id === id) || null;
}

export function isWritable(cal) {
  if (!cal) return false;
  if (cal.type === 'local') return true;
  if (cal.type === 'google') return cal.role === 'owner' || cal.role === 'writer' || cal.role === undefined;
  return false;
}

function windowRange() {
  const today = ymdInTz(new Date(), tz());
  const [y, m, d] = addDaysYmd(today, -SYNC_PAST_DAYS).split('-').map(Number);
  const [y2, m2, d2] = addDaysYmd(today, SYNC_FUTURE_DAYS).split('-').map(Number);
  return { from: zonedToUtc(y, m, d, 0, 0, 0, tz()), to: zonedToUtc(y2, m2, d2, 0, 0, 0, tz()) };
}

async function fetchIcs(url) {
  const u = url.replace(/^webcal:\/\//i, 'https://');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(u, { signal: ctrl.signal, headers: { 'user-agent': 'Familienwand/1.0 (+self-hosted)' } });
    if (!res.ok) throw new Error(`iCal-Link antwortet mit ${res.status}`);
    const text = await res.text();
    if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error('Unter dem Link liegt kein iCal-Kalender.');
    return text;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('iCal-Link antwortet nicht (Zeitüberschreitung).');
    throw e;
  } finally { clearTimeout(t); }
}

export async function syncCalendar(cal) {
  if (cal.type === 'local') return;
  if (syncing.has(cal.id)) return syncing.get(cal.id);
  const job = (async () => {
    const cache = getCache();
    const entry = cache[cal.id] || { events: [] };
    try {
      const { from, to } = windowRange();
      let events;
      if (cal.type === 'google') {
        const sa = readServiceAccount();
        if (!sa) throw new Error('Google ist noch nicht verbunden (Dienstkonto-Schlüssel fehlt).');
        events = await google.listEvents(sa, cal.googleId, from.toISOString(), to.toISOString());
      } else if (cal.type === 'ics') {
        events = parseIcs(await fetchIcs(cal.url), { from, to, tz: tz() });
      } else return;
      const before = JSON.stringify(entry.events || []);
      cache[cal.id] = { events, syncedAt: new Date().toISOString(), error: null };
      if (JSON.stringify(events) !== before) emitChange('sync');
    } catch (e) {
      cache[cal.id] = { ...entry, error: e.message, errorAt: new Date().toISOString() };
      console.error(`[sync] ${cal.name}: ${e.message}`);
    }
    save();
  })().finally(() => syncing.delete(cal.id));
  syncing.set(cal.id, job);
  return job;
}

export async function syncAll() {
  await Promise.all(getDb().calendars.map((c) => syncCalendar(c)));
}

let interval = null;
export function startSyncLoop(minutes) {
  clearInterval(interval);
  syncAll();
  interval = setInterval(syncAll, Math.max(1, minutes) * 60000);
}
export function stopSyncLoop() { clearInterval(interval); }

export function calendarStatus(cal) {
  const c = getCache()[cal.id];
  if (cal.type === 'local') return { ok: true, syncedAt: null, error: null, count: (getDb().localEvents[cal.id] || []).length };
  return { ok: !!(c && !c.error), syncedAt: c ? c.syncedAt || null : null, error: c ? c.error || null : null, count: c && c.events ? c.events.length : 0 };
}

/**
 * Wem gehört ein Termin? (Idee aus Kinboard)
 * 1. explizit in der App gewählt (gespeichert im Termin)
 * 2. Kalender gehört einer Person
 * 3. Titel-Regel: „Mama: Yoga“, „Yoga (Mama)“ oder „@Mama“
 * sonst: ganze Familie (leere Liste)
 */
export function resolvePeople(e, cal, people) {
  if (Array.isArray(e.people) && e.people.length) return e.people.filter((id) => people.some((p) => p.id === id));
  if (cal.personId) return [cal.personId];
  const t = (e.title || '').toLowerCase();
  const hits = people.filter((p) => {
    const n = p.name.toLowerCase();
    return n && (t.startsWith(n + ':') || t.startsWith(n + ' -') || t.includes('(' + n + ')') || t.includes('@' + n));
  });
  return hits.map((p) => p.id);
}

/** Alle Termine, die das Fenster [fromYmd, toYmd] (inklusive) berühren. */
export function listEvents(fromYmd, toYmd) {
  const db = getDb();
  const [fy, fm, fd] = fromYmd.split('-').map(Number);
  const [ty, tm, td] = addDaysYmd(toYmd, 1).split('-').map(Number);
  const fromT = zonedToUtc(fy, fm, fd, 0, 0, 0, tz()).toISOString();
  const toT = zonedToUtc(ty, tm, td, 0, 0, 0, tz()).toISOString();
  const toExcl = addDaysYmd(toYmd, 1);
  const out = [];
  for (const cal of db.calendars) {
    const list = cal.type === 'local' ? (db.localEvents[cal.id] || []) : ((getCache()[cal.id] || {}).events || []);
    const writable = isWritable(cal);
    for (const e of list) {
      const hit = e.allDay ? (e.start < toExcl && e.end > fromYmd) : (e.start < toT && e.end > fromT);
      if (!hit) continue;
      out.push({ ...e, calendarId: cal.id, editable: writable, people: resolvePeople(e, cal, db.people) });
    }
  }
  out.sort((a, b) => {
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
    const sa = a.allDay ? a.start : a.start, sb = b.start;
    return sa < sb ? -1 : sa > sb ? 1 : a.title.localeCompare(b.title);
  });
  return out;
}

const TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** Prüft und normalisiert Eingaben aus der App. Wirft Error mit verständlicher Meldung. */
export function validateInput(body) {
  const title = String(body.title || '').trim().slice(0, 200);
  if (!title) throw httpError(400, 'Bitte gib einen Titel ein.');
  const location = String(body.location || '').trim().slice(0, 300);
  const notes = String(body.notes || '').trim().slice(0, 4000);
  const known = new Set(getDb().people.map((p) => p.id));
  const people = Array.isArray(body.people) ? [...new Set(body.people.filter((id) => known.has(id)))] : [];
  if (body.allDay) {
    const startDate = body.date;
    const lastDate = body.endDate || body.date;
    if (!isYmd(startDate) || !isYmd(lastDate)) throw httpError(400, 'Das Datum ist ungültig.');
    if (lastDate < startDate) throw httpError(400, 'Das Enddatum liegt vor dem Startdatum.');
    return { title, location, notes, people, allDay: true, startDate, endDateExclusive: addDaysYmd(lastDate, 1) };
  }
  if (!TIME_RE.test(body.start || '') || !TIME_RE.test(body.end || '')) throw httpError(400, 'Uhrzeit ist ungültig.');
  const st = naiveToUtc(body.start, tz()), en = naiveToUtc(body.end, tz());
  if (!st || !en || isNaN(st) || isNaN(en)) throw httpError(400, 'Uhrzeit ist ungültig.');
  let endNaive = body.end, endUtc = en;
  if (en <= st) { endUtc = new Date(st.getTime() + 3600000); endNaive = null; }
  return {
    title, location, notes, people, allDay: false,
    startNaive: `${body.start}:00`, endNaive: endNaive ? `${endNaive}:00` : null,
    startUtc: st, endUtc,
  };
}

function fillEndNaive(input) {
  if (!input.allDay && !input.endNaive) {
    // Ortszeit aus UTC ableiten
    const d = input.endUtc;
    const p = new Intl.DateTimeFormat('sv-SE', { timeZone: tz(), year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(d);
    input.endNaive = p.replace(' ', 'T');
  }
  return input;
}

function localRecord(input, id) {
  return input.allDay
    ? { id, title: input.title, allDay: true, start: input.startDate, end: input.endDateExclusive, location: input.location, notes: input.notes, people: input.people }
    : { id, title: input.title, allDay: false, start: input.startUtc.toISOString(), end: input.endUtc.toISOString(), location: input.location, notes: input.notes, people: input.people };
}

export function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function requireWritable(calId) {
  const cal = calendarById(calId);
  if (!cal) throw httpError(404, 'Kalender nicht gefunden.');
  if (!isWritable(cal)) throw httpError(403, `„${cal.name}“ ist nur lesbar.`);
  return cal;
}

function sa() {
  const s = readServiceAccount();
  if (!s) throw httpError(400, 'Google ist nicht verbunden.');
  return s;
}

function upsertCache(calId, ev) {
  const c = getCache()[calId] || (getCache()[calId] = { events: [], syncedAt: null, error: null });
  c.events = c.events.filter((e) => e.id !== ev.id).concat(ev);
  save();
}

export async function createEvent(body) {
  const cal = requireWritable(body.calendarId);
  const input = fillEndNaive(validateInput(body));
  if (cal.type === 'local') {
    const rec = localRecord(input, newId('e'));
    (getDb().localEvents[cal.id] ||= []).push(rec);
    save();
    return decorate(rec, cal);
  }
  const ev = await google.insertEvent(sa(), cal.googleId, input, tz());
  upsertCache(cal.id, ev);
  return decorate(ev, cal);
}

function decorate(e, cal) {
  return { ...e, calendarId: cal.id, editable: true, people: resolvePeople(e, cal, getDb().people) };
}

export async function updateEvent(calId, eventId, body) {
  const cal = requireWritable(calId);
  const input = fillEndNaive(validateInput(body));
  const targetCalId = body.calendarId || calId;
  if (targetCalId !== calId) {
    // In anderen Kalender verschieben = neu anlegen + alten löschen (einfach und quellenübergreifend)
    const created = await createEvent({ ...body, calendarId: targetCalId });
    await deleteEvent(calId, eventId);
    return created;
  }
  if (cal.type === 'local') {
    const list = getDb().localEvents[cal.id] || [];
    const i = list.findIndex((e) => e.id === eventId);
    if (i < 0) throw httpError(404, 'Termin nicht gefunden.');
    list[i] = localRecord(input, eventId);
    save();
    return decorate(list[i], cal);
  }
  const ev = await google.patchEvent(sa(), cal.googleId, eventId, input, tz());
  upsertCache(cal.id, ev);
  return decorate(ev, cal);
}

export async function deleteEvent(calId, eventId) {
  const cal = requireWritable(calId);
  if (cal.type === 'local') {
    const list = getDb().localEvents[cal.id] || [];
    getDb().localEvents[cal.id] = list.filter((e) => e.id !== eventId);
    save();
    return;
  }
  await google.deleteEvent(sa(), cal.googleId, eventId);
  const c = getCache()[cal.id];
  if (c) c.events = c.events.filter((e) => e.id !== eventId);
  save();
}
