// Erinnerungen aufs Handy über ntfy (https://ntfy.sh, App für Android & iOS, auch selbst hostbar).
// Ansatz aus momo übernommen: JSON-Body an die Server-Wurzel statt Header,
// damit Umlaute und Emojis sicher ankommen (HTTP-Header sind nur Latin-1).
import { getDb, save } from './store.js';
import { listEvents, tz } from './calendar.js';
import { ymdInTz, addDaysYmd, localParts } from './tz.js';

export async function sendNtfy({ server, topic, title, message, tags, click, priority = 3 }) {
  if (!topic) throw new Error('Kein ntfy-Thema eingestellt.');
  const base = (server || 'https://ntfy.sh').replace(/\/+$/, '');
  const res = await fetch(base, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ topic, title, message, tags, priority, ...(click ? { click } : {}) }),
  });
  if (!res.ok) throw new Error(`ntfy antwortet mit ${res.status}`);
}

const hm = (iso) => new Intl.DateTimeFormat('de-DE', { timeZone: tz(), hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

function topicsFor(ev, cfg, people) {
  const t = new Set();
  for (const id of ev.people || []) {
    const p = people.find((x) => x.id === id);
    if (p && p.ntfyTopic) t.add(p.ntfyTopic);
  }
  if (!t.size && cfg.topic) t.add(cfg.topic);
  return [...t];
}

function who(ev, people) {
  const list = (ev.people || []).map((id) => people.find((p) => p.id === id)).filter(Boolean);
  return list.length ? list.map((p) => p.emoji).join('') + ' ' : '👨‍👩‍👧 ';
}

export async function tick(now = new Date()) {
  const db = getDb();
  const cfg = db.settings.ntfy;
  if (!cfg || !cfg.enabled || !cfg.topic) return;
  db.reminderSent ||= {};
  const today = ymdInTz(now, tz());
  const events = listEvents(today, addDaysYmd(today, 1));
  const cals = Object.fromEntries(db.calendars.map((c) => [c.id, c]));
  const lead = Math.max(5, Number(cfg.minutesBefore) || 30);
  const click = db.settings.appUrl || undefined;
  let changed = false;

  for (const ev of events) {
    if (ev.allDay) continue;
    const cal = cals[ev.calendarId];
    if (!cal || cal.kind === 'waste' || cal.kind === 'holiday' || cal.remind === false) continue;
    const mins = (new Date(ev.start) - now) / 60000;
    const key = `${ev.calendarId}|${ev.id}|${ev.start}`;
    if (mins > 0 && mins <= lead && !db.reminderSent[key]) {
      db.reminderSent[key] = now.toISOString();
      changed = true;
      const msg = `${hm(ev.start)}–${hm(ev.end)}${ev.location ? ' · ' + ev.location : ''}\nNoch ${Math.round(mins)} Minuten – genug Zeit, ganz entspannt.`;
      for (const topic of topicsFor(ev, cfg, db.people)) {
        sendNtfy({ server: cfg.server, topic, title: `${who(ev, db.people)}${ev.title}`, message: msg, tags: ['calendar'], click })
          .catch((e) => console.error('[ntfy]', e.message));
      }
    }
  }

  // Morgen-Zusammenfassung (Idee aus momo: „Morning Briefing“)
  if (cfg.morningAt && db.lastMorning !== today) {
    const p = localParts(now, tz());
    const [mh, mm] = String(cfg.morningAt).split(':').map(Number);
    if (p.h * 60 + p.mi >= mh * 60 + mm && p.h < 12) {
      db.lastMorning = today;
      changed = true;
      const todays = events.filter((e) => (e.allDay ? e.start <= today && e.end > today : ymdInTz(new Date(e.start), tz()) === today));
      const waste = todays.filter((e) => cals[e.calendarId] && cals[e.calendarId].kind === 'waste');
      const normal = todays.filter((e) => !waste.includes(e) && !(cals[e.calendarId] && cals[e.calendarId].kind === 'holiday'));
      const lines = normal.map((e) => `${e.allDay ? 'ganztägig' : hm(e.start)}  ${who(e, db.people)}${e.title}`);
      if (waste.length) lines.push(`🗑️ Heute: ${waste.map((w) => w.title).join(', ')}`);
      const message = lines.length ? lines.join('\n') : 'Heute stehen keine Termine an. Ein freier Tag 🌿';
      sendNtfy({ server: cfg.server, topic: cfg.topic, title: `☀️ Guten Morgen! ${normal.length ? normal.length + ' Termin' + (normal.length > 1 ? 'e' : '') + ' heute' : 'Freier Tag'}`, message, tags: ['sunny'], click })
        .catch((e) => console.error('[ntfy]', e.message));
    }
  }

  // Alte Einträge aufräumen
  const cutoff = Date.now() - 3 * 86400000;
  for (const [k, v] of Object.entries(db.reminderSent)) if (new Date(v).getTime() < cutoff) { delete db.reminderSent[k]; changed = true; }
  if (changed) save();
}

let timer = null;
export function startReminderLoop() {
  clearInterval(timer);
  timer = setInterval(() => tick().catch((e) => console.error('[ntfy]', e.message)), 60000);
}
export function stopReminderLoop() { clearInterval(timer); }
