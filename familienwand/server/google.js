// Google Calendar API über ein Dienstkonto (Service Account).
// Vorteil gegenüber OAuth: kein Login-Redirect nötig (funktioniert mit jeder NAS-IP)
// und kein Token-Ablauf nach 7 Tagen. Die Familie teilt ihre Kalender einfach mit der
// E-Mail-Adresse des Dienstkontos ("Änderungen an Terminen vornehmen").
import crypto from 'node:crypto';

const API = 'https://www.googleapis.com/calendar/v3';
const SCOPE = 'https://www.googleapis.com/auth/calendar';
let tok = { email: null, token: null, exp: 0 };

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

export function validateServiceAccount(sa) {
  if (!sa || typeof sa !== 'object') return 'Die Datei ist kein JSON-Objekt.';
  if (sa.type !== 'service_account') return 'Das ist kein Dienstkonto-Schlüssel (type muss "service_account" sein).';
  if (!sa.client_email || !sa.private_key) return 'client_email oder private_key fehlt.';
  try { crypto.createPrivateKey(sa.private_key); } catch { return 'private_key ist ungültig.'; }
  return null;
}

async function accessToken(sa) {
  if (tok.token && tok.email === sa.client_email && Date.now() < tok.exp - 60000) return tok.token;
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email, scope: SCOPE, aud: sa.token_uri || 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }));
  const sig = crypto.createSign('RSA-SHA256').update(`${header}.${claim}`).sign(sa.private_key);
  const jwt = `${header}.${claim}.${b64url(sig)}`;
  const res = await fetch(sa.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google-Anmeldung fehlgeschlagen: ${j.error_description || j.error || res.status}`);
  tok = { email: sa.client_email, token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return tok.token;
}

async function gfetch(sa, path, { method = 'GET', query, body } = {}) {
  const url = new URL(API + path);
  if (query) for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${await accessToken(sa)}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (j.error && j.error.message) || res.statusText;
    const err = new Error(friendly(res.status, msg));
    err.status = res.status;
    throw err;
  }
  return j;
}

function friendly(status, msg) {
  if (status === 404) return 'Kalender nicht gefunden. Ist die Kalender-ID richtig und der Kalender mit dem Dienstkonto geteilt?';
  if (status === 403) return `Keine Berechtigung: ${msg}. Wurde beim Teilen „Änderungen an Terminen vornehmen“ gewählt?`;
  return `Google: ${msg}`;
}

const enc = encodeURIComponent;

/** Prüft einen Kalender und liefert Name + Rolle (owner/writer/reader/freeBusyReader). */
export async function inspectCalendar(sa, calendarId) {
  let entry;
  try {
    entry = await gfetch(sa, '/users/me/calendarList', { method: 'POST', body: { id: calendarId } });
  } catch (e) {
    if (e.status !== 409) throw e;
    entry = await gfetch(sa, `/users/me/calendarList/${enc(calendarId)}`);
  }
  return { name: entry.summaryOverride || entry.summary || calendarId, role: entry.accessRole, timeZone: entry.timeZone };
}

export async function listEvents(sa, calendarId, timeMin, timeMax) {
  const out = [];
  let pageToken;
  do {
    const j = await gfetch(sa, `/calendars/${enc(calendarId)}/events`, {
      query: { timeMin, timeMax, singleEvents: 'true', orderBy: 'startTime', maxResults: 2500, pageToken },
    });
    for (const it of j.items || []) {
      const ev = normalize(it);
      if (ev) out.push(ev);
    }
    pageToken = j.nextPageToken;
  } while (pageToken);
  return out;
}

export function normalize(it) {
  if (!it || it.status === 'cancelled' || !it.start) return null;
  const allDay = !!it.start.date;
  return {
    id: it.id,
    title: it.summary || '(ohne Titel)',
    allDay,
    start: allDay ? it.start.date : new Date(it.start.dateTime).toISOString(),
    end: allDay ? (it.end && it.end.date) || it.start.date : new Date((it.end && it.end.dateTime) || it.start.dateTime).toISOString(),
    location: it.location || '',
    notes: it.description || '',
    recurring: !!it.recurringEventId,
    // Personen-Zuordnung aus der App (unsichtbar in Google, wandert aber mit)
    people: it.extendedProperties && it.extendedProperties.private && it.extendedProperties.private.fwPeople
      ? it.extendedProperties.private.fwPeople.split(',').filter(Boolean) : null,
  };
}

function toGoogle(input, tz) {
  const body = {
    summary: input.title, location: input.location || '', description: input.notes || '',
    extendedProperties: { private: { fwPeople: (input.people || []).join(',') } },
  };
  if (input.allDay) {
    body.start = { date: input.startDate };
    body.end = { date: input.endDateExclusive };
  } else {
    body.start = { dateTime: input.startNaive, timeZone: tz };
    body.end = { dateTime: input.endNaive, timeZone: tz };
  }
  return body;
}

export async function insertEvent(sa, calendarId, input, tz) {
  return normalize(await gfetch(sa, `/calendars/${enc(calendarId)}/events`, { method: 'POST', body: toGoogle(input, tz) }));
}

export async function patchEvent(sa, calendarId, eventId, input, tz) {
  return normalize(await gfetch(sa, `/calendars/${enc(calendarId)}/events/${enc(eventId)}`, { method: 'PATCH', body: toGoogle(input, tz) }));
}

export async function deleteEvent(sa, calendarId, eventId) {
  try {
    await gfetch(sa, `/calendars/${enc(calendarId)}/events/${enc(eventId)}`, { method: 'DELETE' });
  } catch (e) {
    if (e.status !== 410 && e.status !== 404) throw e; // schon weg
  }
}
