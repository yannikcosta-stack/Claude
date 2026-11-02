// Familienwand – Server ohne externe Abhängigkeiten (nur Node.js ≥ 22).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as store from './store.js';
import * as cal from './calendar.js';
import * as google from './google.js';
import { parseIcs } from './ics.js';
import { getWeather, geocode } from './weather.js';
import { sendNtfy, startReminderLoop, stopReminderLoop } from './notify.js';
import { isYmd, isValidTz } from './tz.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.resolve(__dirname, '..', 'public');
const VERSION = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8')).version;
const PASSWORD = process.env.APP_PASSWORD || '';
const COOKIE = 'fw_session';
const SESSION_DAYS = 400;
let SECRET;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

// ---------------- Hilfen ----------------
function send(res, status, body, headers = {}) {
  const isObj = body !== null && typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(status, { 'content-type': isObj ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(isObj ? JSON.stringify(body) : body);
}

function readBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(cal.httpError(413, 'Anfrage zu groß.')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(cal.httpError(400, 'Ungültiges JSON.')); }
    });
    req.on('error', reject);
  });
}

function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

const sign = (v) => crypto.createHmac('sha256', SECRET).update(v).digest('base64url');
function makeSession() { const exp = String(Date.now() + SESSION_DAYS * 86400000); return `${exp}.${sign(exp)}`; }
function validSession(tok) {
  if (!tok) return false;
  const [exp, sig] = tok.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const a = Buffer.from(sig), b = Buffer.from(sign(exp));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const authed = (req) => !PASSWORD || validSession(cookies(req)[COOKIE]);
const isHttps = (req) => req.socket.encrypted || String(req.headers['x-forwarded-proto'] || '').startsWith('https');

const loginTries = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const list = (loginTries.get(ip) || []).filter((t) => now - t < 60000);
  list.push(now);
  loginTries.set(ip, list);
  return list.length > 8;
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const clean = (s, n = 80) => String(s == null ? '' : s).trim().slice(0, n);

// ---------------- Live-Updates (Server-Sent Events) ----------------
const streams = new Set();
cal.onChange((reason) => {
  for (const res of streams) res.write(`event: change\ndata: ${JSON.stringify({ reason, at: Date.now() })}\n\n`);
});
setInterval(() => { for (const res of streams) res.write(': ping\n\n'); }, 25000).unref();

// ---------------- Daten für die App ----------------
function bootstrap() {
  const db = store.getDb();
  const sa = store.readServiceAccount();
  return {
    version: VERSION,
    authRequired: !!PASSWORD,
    google: { configured: !!sa, email: sa ? sa.client_email : null },
    settings: db.settings,
    people: db.people,
    calendars: db.calendars.map((c) => ({ ...c, writable: cal.isWritable(c), status: cal.calendarStatus(c) })),
  };
}

function sanitizeCalendarPatch(b, existing) {
  const db = store.getDb();
  const out = {};
  if ('name' in b) out.name = clean(b.name, 60) || (existing && existing.name) || 'Kalender';
  if ('personId' in b) out.personId = b.personId && db.people.some((p) => p.id === b.personId) ? b.personId : null;
  if ('color' in b) out.color = COLOR_RE.test(b.color || '') ? b.color : null;
  if ('kind' in b) out.kind = ['normal', 'holiday', 'waste'].includes(b.kind) ? b.kind : 'normal';
  if ('remind' in b) out.remind = b.remind !== false;
  if ('isDefault' in b) out.isDefault = !!b.isDefault;
  return out;
}

async function testCalendar(b) {
  if (b.type === 'google') {
    const sa = store.readServiceAccount();
    if (!sa) throw cal.httpError(400, 'Lade zuerst den Google-Dienstkonto-Schlüssel hoch.');
    const id = clean(b.googleId, 200);
    if (!id) throw cal.httpError(400, 'Bitte gib die Kalender-ID ein.');
    try {
      const info = await google.inspectCalendar(sa, id);
      return { ok: true, name: info.name, role: info.role, writable: info.role === 'owner' || info.role === 'writer' };
    } catch (e) { throw cal.httpError(400, e.message); }
  }
  if (b.type === 'ics') {
    const url = clean(b.url, 2000).replace(/^webcal:\/\//i, 'https://');
    if (!/^https?:\/\//i.test(url)) throw cal.httpError(400, 'Der Link muss mit https:// oder webcal:// beginnen.');
    let text;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error(`Der Link antwortet mit ${r.status}.`);
      text = await r.text();
    } catch (e) { throw cal.httpError(400, e.name === 'TimeoutError' ? 'Der Link antwortet nicht.' : e.message); }
    if (!/BEGIN:VCALENDAR/i.test(text)) throw cal.httpError(400, 'Unter dem Link liegt kein iCal-Kalender.');
    const name = (/^X-WR-CALNAME:(.*)$/im.exec(text) || [])[1];
    const now = new Date();
    const n = parseIcs(text, { from: now, to: new Date(now.getTime() + 90 * 86400000), tz: cal.tz() }).length;
    return { ok: true, name: name ? name.trim() : null, upcoming: n, writable: false };
  }
  return { ok: true, writable: true };
}

// ---------------- API ----------------
async function api(req, res, url) {
  const p = url.pathname;
  const m = req.method;

  if (p === '/api/health') return send(res, 200, { status: 'ok', version: VERSION });

  if (p === '/api/login' && m === 'POST') {
    const ip = req.socket.remoteAddress || '?';
    if (rateLimited(ip)) return send(res, 429, { error: 'Zu viele Versuche. Bitte warte eine Minute.' });
    const b = await readBody(req);
    if (!PASSWORD || safeEqual(b.password || '', PASSWORD)) {
      const attrs = [`${COOKIE}=${makeSession()}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${SESSION_DAYS * 86400}`];
      if (isHttps(req)) attrs.push('Secure');
      return send(res, 200, { ok: true }, { 'set-cookie': attrs.join('; ') });
    }
    return send(res, 401, { error: 'Das Passwort stimmt nicht.' });
  }
  if (p === '/api/logout' && m === 'POST') return send(res, 200, { ok: true }, { 'set-cookie': `${COOKIE}=; Path=/; Max-Age=0` });

  if (!authed(req)) return send(res, 401, { error: 'Bitte anmelden.', authRequired: true });

  if (p === '/api/bootstrap' && m === 'GET') return send(res, 200, bootstrap());

  if (p === '/api/stream' && m === 'GET') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    res.write('retry: 5000\n\n');
    streams.add(res);
    req.on('close', () => streams.delete(res));
    return;
  }

  if (p === '/api/events' && m === 'GET') {
    const from = url.searchParams.get('from'), to = url.searchParams.get('to');
    if (!isYmd(from) || !isYmd(to) || to < from) return send(res, 400, { error: 'from/to müssen Daten (JJJJ-MM-TT) sein.' });
    return send(res, 200, { events: cal.listEvents(from, to) });
  }
  if (p === '/api/events' && m === 'POST') {
    const ev = await cal.createEvent(await readBody(req));
    cal.emitChange('create');
    return send(res, 201, ev);
  }
  let mm = /^\/api\/events\/([^/]+)\/([^/]+)$/.exec(p);
  if (mm) {
    const calId = decodeURIComponent(mm[1]), evId = decodeURIComponent(mm[2]);
    if (m === 'PATCH') { const ev = await cal.updateEvent(calId, evId, await readBody(req)); cal.emitChange('update'); return send(res, 200, ev); }
    if (m === 'DELETE') { await cal.deleteEvent(calId, evId); cal.emitChange('delete'); return send(res, 200, { ok: true }); }
  }

  if (p === '/api/sync' && m === 'POST') { await cal.syncAll(); cal.emitChange('sync'); return send(res, 200, bootstrap()); }

  if (p === '/api/people' && m === 'PUT') {
    const b = await readBody(req);
    if (!Array.isArray(b.people) || b.people.length > 20) return send(res, 400, { error: 'Ungültige Personenliste.' });
    store.getDb().people = b.people.map((x) => ({
      id: /^p_[a-z0-9_]{1,40}$/.test(x.id || '') ? x.id : store.newId('p'),
      name: clean(x.name, 30) || 'Person',
      emoji: clean(x.emoji, 16) || '🙂',
      color: COLOR_RE.test(x.color || '') ? x.color : '#7B5BD6',
      ntfyTopic: clean(x.ntfyTopic, 64) || undefined,
    }));
    store.save(); cal.emitChange('people');
    return send(res, 200, bootstrap());
  }

  if (p === '/api/settings' && m === 'PUT') {
    const b = await readBody(req);
    const s = store.getDb().settings;
    if ('familyName' in b) s.familyName = clean(b.familyName, 40) || 'Familie';
    if ('weekStart' in b) s.weekStart = b.weekStart === 'monday' ? 'monday' : 'today';
    if ('timezone' in b && isValidTz(b.timezone)) s.timezone = b.timezone;
    if ('nightFrom' in b) s.nightFrom = TIME_RE.test(b.nightFrom || '') ? b.nightFrom : null;
    if ('nightTo' in b) s.nightTo = TIME_RE.test(b.nightTo || '') ? b.nightTo : null;
    if ('appUrl' in b) s.appUrl = /^https?:\/\//.test(b.appUrl || '') ? clean(b.appUrl, 200) : null;
    if ('weather' in b) {
      const w = b.weather;
      s.weather = w && typeof w.lat === 'number' && typeof w.lon === 'number' ? { name: clean(w.name, 60), lat: w.lat, lon: w.lon } : null;
    }
    if ('ntfy' in b && b.ntfy && typeof b.ntfy === 'object') {
      const n = b.ntfy;
      s.ntfy = {
        enabled: !!n.enabled,
        server: /^https?:\/\//.test(n.server || '') ? clean(n.server, 200) : 'https://ntfy.sh',
        topic: clean(n.topic, 64).replace(/[^A-Za-z0-9_-]/g, ''),
        minutesBefore: Math.min(240, Math.max(5, parseInt(n.minutesBefore, 10) || 30)),
        morningAt: TIME_RE.test(n.morningAt || '') ? n.morningAt : null,
      };
    }
    store.save(); cal.emitChange('settings');
    return send(res, 200, bootstrap());
  }

  if (p === '/api/ntfy/test' && m === 'POST') {
    const n = store.getDb().settings.ntfy || {};
    try {
      await sendNtfy({ server: n.server, topic: n.topic, title: '👋 Familienwand verbunden', message: 'Ab jetzt kommen hier die Termin-Erinnerungen an.', tags: ['tada'] });
    } catch (e) { return send(res, 400, { error: e.message }); }
    return send(res, 200, { ok: true });
  }

  if (p === '/api/google/key' && m === 'POST') {
    const sa = await readBody(req, 64000);
    const err = google.validateServiceAccount(sa);
    if (err) return send(res, 400, { error: err });
    store.writeServiceAccount(sa);
    cal.syncAll().then(() => cal.emitChange('sync'));
    return send(res, 200, bootstrap());
  }
  if (p === '/api/google/key' && m === 'DELETE') { store.deleteServiceAccount(); return send(res, 200, bootstrap()); }

  if (p === '/api/calendars/test' && m === 'POST') return send(res, 200, await testCalendar(await readBody(req)));

  if (p === '/api/calendars' && m === 'POST') {
    const b = await readBody(req);
    if (!['google', 'ics', 'local'].includes(b.type)) return send(res, 400, { error: 'Unbekannter Kalendertyp.' });
    const t = await testCalendar(b);
    const c = {
      id: store.newId('c'), type: b.type,
      name: clean(b.name, 60) || t.name || (b.type === 'local' ? 'Familie' : 'Kalender'),
      ...sanitizeCalendarPatch({ personId: b.personId, color: b.color, kind: b.kind || 'normal' }),
    };
    if (b.type === 'google') { c.googleId = clean(b.googleId, 200); c.role = t.role; }
    if (b.type === 'ics') c.url = clean(b.url, 2000);
    store.getDb().calendars.push(c);
    store.save();
    await cal.syncCalendar(c);
    cal.emitChange('calendars');
    return send(res, 201, bootstrap());
  }
  mm = /^\/api\/calendars\/([^/]+)$/.exec(p);
  if (mm) {
    const db = store.getDb();
    const c = db.calendars.find((x) => x.id === decodeURIComponent(mm[1]));
    if (!c) return send(res, 404, { error: 'Kalender nicht gefunden.' });
    if (m === 'PATCH') {
      const patch = sanitizeCalendarPatch(await readBody(req), c);
      if (patch.isDefault) for (const x of db.calendars) x.isDefault = false;
      Object.assign(c, patch);
      store.save(); cal.emitChange('calendars');
      return send(res, 200, bootstrap());
    }
    if (m === 'DELETE') {
      db.calendars = db.calendars.filter((x) => x !== c);
      delete db.localEvents[c.id];
      delete store.getCache()[c.id];
      store.save(); cal.emitChange('calendars');
      return send(res, 200, bootstrap());
    }
  }

  if (p === '/api/weather' && m === 'GET') {
    try { return send(res, 200, { weather: await getWeather(store.getDb().settings.weather) }); } catch (e) { return send(res, 200, { weather: null, error: e.message }); }
  }
  if (p === '/api/geocode' && m === 'GET') {
    const q = clean(url.searchParams.get('q'), 80);
    if (q.length < 2) return send(res, 200, { results: [] });
    try { return send(res, 200, { results: await geocode(q) }); } catch (e) { return send(res, 502, { error: e.message }); }
  }

  return send(res, 404, { error: 'Nicht gefunden.' });
}

// ---------------- Statische Dateien ----------------
let shellCache = null;
function shell(mode) {
  if (!shellCache || process.env.NODE_ENV === 'development') shellCache = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
  return shellCache
    .replace('{{MODE}}', mode)
    .replace('{{MANIFEST}}', mode === 'wall' ? '/wall.webmanifest' : '/manifest.webmanifest')
    .replaceAll('{{V}}', VERSION);
}

function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/' || p === '/index.html') return send(res, 200, shell('mobile'), { 'content-type': TYPES['.html'], 'cache-control': 'no-cache' });
  if (p === '/wall' || p === '/wall/') return send(res, 200, shell('wall'), { 'content-type': TYPES['.html'], 'cache-control': 'no-cache' });
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, 'Verboten');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Nicht gefunden');
    const ext = path.extname(file);
    const longCache = /\/(fonts|icons)\//.test(p);
    res.writeHead(200, {
      'content-type': TYPES[ext] || 'application/octet-stream',
      'cache-control': longCache ? 'public, max-age=31536000, immutable' : 'no-cache',
      ...(p === '/sw.js' ? { 'service-worker-allowed': '/' } : {}),
    });
    fs.createReadStream(file).pipe(res);
  });
}

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
  'x-frame-options': 'SAMEORIGIN',
  'content-security-policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; connect-src 'self'; font-src 'self'; frame-ancestors 'self'",
};

export function createServer() {
  return http.createServer(async (req, res) => {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    const url = new URL(req.url, 'http://x');
    try {
      if (url.pathname.startsWith('/api/')) return await api(req, res, url);
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Methode nicht erlaubt');
      return serveStatic(req, res, url);
    } catch (e) {
      const status = e.status || 500;
      if (status >= 500) console.error('[api]', e);
      if (!res.headersSent) send(res, status, { error: status >= 500 ? `Serverfehler: ${e.message}` : e.message });
    }
  });
}

export function start({ port = Number(process.env.PORT) || 8080, sync = true } = {}) {
  store.load();
  SECRET = store.secretKey();
  const server = createServer();
  server.listen(port, () => {
    console.log(`Familienwand ${VERSION} läuft auf Port ${server.address().port}${PASSWORD ? ' (mit Passwort)' : ' (OHNE Passwort – nur im Heimnetz verwenden!)'}`);
  });
  if (sync) {
    cal.startSyncLoop(Number(process.env.SYNC_MINUTES) || 3);
    startReminderLoop();
  }
  const stop = () => { cal.stopSyncLoop(); stopReminderLoop(); store.flush(); for (const r of streams) r.end(); server.close(); };
  return { server, stop };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { stop } = start();
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stop(); process.exit(0); });
}
