// Einfacher, robuster JSON-Speicher (atomisches Schreiben). Für eine Familie mehr als ausreichend.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');

const DEFAULT_DB = () => ({
  version: 1,
  settings: {
    familyName: 'Familie',
    timezone: process.env.TZ && process.env.TZ !== 'UTC' ? process.env.TZ : 'Europe/Berlin',
    weekStart: 'today', // 'today' | 'monday'
    weather: null, // { name, lat, lon }
    nightFrom: '22:00',
    nightTo: '06:00',
  },
  people: [
    { id: 'p_papa', name: 'Papa', emoji: '🧔', color: '#2F86D8' },
    { id: 'p_mama', name: 'Mama', emoji: '👩', color: '#D3367A' },
    { id: 'p_kind', name: 'Kind', emoji: '🧒', color: '#E9A70E' },
  ],
  calendars: [
    { id: 'c_familie', name: 'Familie', type: 'local', personId: null, color: '#169C68', isDefault: true },
  ],
  localEvents: {},
});

let db = null;
let cache = null; // { [calendarId]: { events, syncedAt, error } }
let timer = null;

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') console.error(`[store] ${file} unlesbar:`, e.message);
    return fallback;
  }
}

function writeJsonAtomic(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

export function load() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const def = DEFAULT_DB();
  db = readJson(path.join(DATA_DIR, 'db.json'), null);
  if (!db) {
    db = def;
    writeJsonAtomic(path.join(DATA_DIR, 'db.json'), db);
  }
  db.settings = { ...def.settings, ...(db.settings || {}) };
  db.people ||= [];
  db.calendars ||= [];
  db.localEvents ||= {};
  cache = readJson(path.join(DATA_DIR, 'cache.json'), {});
  return db;
}

export function getDb() { return db; }
export function getCache() { return cache; }

export function save() {
  clearTimeout(timer);
  timer = setTimeout(flush, 200);
}

export function flush() {
  clearTimeout(timer);
  if (!db) return;
  writeJsonAtomic(path.join(DATA_DIR, 'db.json'), db);
  writeJsonAtomic(path.join(DATA_DIR, 'cache.json'), cache);
}

export function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

/** Geheimer Schlüssel für Login-Cookies, wird beim ersten Start erzeugt. */
export function secretKey() {
  const f = path.join(DATA_DIR, 'secret.key');
  try { return fs.readFileSync(f); } catch { /* neu anlegen */ }
  const k = crypto.randomBytes(32);
  fs.writeFileSync(f, k, { mode: 0o600 });
  return k;
}

// ---- Google-Dienstkonto-Schlüssel ----
const SA_FILE = () => process.env.GOOGLE_SERVICE_ACCOUNT_FILE || path.join(DATA_DIR, 'google-service-account.json');

export function readServiceAccount() {
  const sa = readJson(SA_FILE(), null);
  if (sa && sa.client_email && sa.private_key) return sa;
  return null;
}

export function writeServiceAccount(sa) {
  fs.writeFileSync(SA_FILE(), JSON.stringify(sa, null, 2), { mode: 0o600 });
}

export function deleteServiceAccount() {
  try { fs.unlinkSync(SA_FILE()); } catch { /* egal */ }
}
