// Tagesfluss – ADHS-freundlicher Tagesbegleiter mit Spiel-Elementen.
// Regeln für Münzen, Level, Serie mit Monats-Joker, doppelte Münzen nach 3× Verschieben,
// Energie-Check-in und Erfolge in vier Seltenheiten sind von momo übernommen
// (https://github.com/jp1337/momo, MIT). Sticker, Combos, Sterne und Abend-Truhe aus dem Tagesfluss-Entwurf.
import { getDb, save, newId } from './store.js';
import { listEvents, tz, httpError, emitChange } from './calendar.js';
import { ymdInTz, addDaysYmd, zonedToUtc, localParts, isYmd } from './tz.js';
import '../public/flussplan.js';
import { sendNtfy } from './notify.js';

const FWPlan = globalThis.FWPlan;

// ---- Level (momo-Schwellen, gezählt über alle je verdienten Münzen) ----
export const LEVELS = [
  { level: 1, min: 0, title: 'Funke', emoji: '✨' },
  { level: 2, min: 50, title: 'Flämmchen', emoji: '🕯️' },
  { level: 3, min: 150, title: 'Lagerfeuer', emoji: '🔥' },
  { level: 4, min: 300, title: 'Sonnenaufgang', emoji: '🌅' },
  { level: 5, min: 500, title: 'Regenbogen', emoji: '🌈' },
  { level: 6, min: 800, title: 'Polarlicht', emoji: '🌌' },
  { level: 7, min: 1200, title: 'Sternschnuppe', emoji: '🌠' },
  { level: 8, min: 1700, title: 'Komet', emoji: '☄️' },
  { level: 9, min: 2300, title: 'Galaxie', emoji: '🪐' },
  { level: 10, min: 3000, title: 'Supernova', emoji: '💫' },
];
export function levelFor(lifetime) {
  let cur = LEVELS[0];
  for (const l of LEVELS) if (lifetime >= l.min) cur = l;
  const next = LEVELS.find((l) => l.level === cur.level + 1) || null;
  return { ...cur, next: next ? next.min : null };
}

// ---- Sticker-Sets nach Jahreszeit ----
export const SETS = {
  winter: { name: 'Winterzauber', emoji: '❄️', stickers: ['⛄', '❄️', '🧤', '🎄', '🍪', '🍵', '🦌', '🌟', '🧦', '🛷', '🐧', '🔥'] },
  fruehling: { name: 'Frühlingswiese', emoji: '🌷', stickers: ['🌷', '🐣', '🌸', '🦋', '🐝', '🌱', '🐞', '🌈', '🐰', '🐥', '☔', '🍓'] },
  sommer: { name: 'Sommerferien', emoji: '🌻', stickers: ['🌻', '🍉', '🍦', '🐚', '🌊', '🕶️', '🏖️', '🍋', '🦩', '⛱️', '🐬', '🌞'] },
  herbst: { name: 'Herbstzeit', emoji: '🍁', stickers: ['🍂', '🍁', '🎃', '🌰', '☕', '🦔', '🍄', '🍎', '🧣', '🦊', '🌧️', '🕯️'] },
};
export function setForDate(ymd) {
  const m = +ymd.slice(5, 7);
  return m === 12 || m <= 2 ? 'winter' : m <= 5 ? 'fruehling' : m <= 8 ? 'sommer' : 'herbst';
}

// ---- Erfolge (Seltenheiten und Münzen wie bei momo) ----
const RARITY_COINS = { common: 10, rare: 25, epic: 50, legendary: 100 };
export const ACHIEVEMENTS = [
  { key: 'first_block', emoji: '👣', title: 'Erster Schritt', text: 'Den ersten Block geschafft', rarity: 'common', test: (s) => s.blocksDone >= 1 },
  { key: 'first_pause', emoji: '☕', title: 'Pause genossen', text: 'Eine Pause bewusst gemacht', rarity: 'common', test: (s) => s.pausesDone >= 1 },
  { key: 'first_reward', emoji: '🎁', title: 'Gönn dir', text: 'Die erste Belohnung eingelöst', rarity: 'common', test: (s) => s.redeemed >= 1 },
  { key: 'combo_3', emoji: '🔥', title: 'Combo!', text: '3 Blöcke hintereinander', rarity: 'common', test: (s) => s.maxCombo >= 3 },
  { key: 'streak_3', emoji: '📅', title: 'Drei Tage am Stück', text: '3 Tage in Folge etwas geschafft', rarity: 'rare', test: (s, p) => p.streak.max >= 3 },
  { key: 'streak_7', emoji: '🗓️', title: 'Eine ganze Woche', text: '7 Tage in Folge', rarity: 'rare', test: (s, p) => p.streak.max >= 7 },
  { key: 'blocks_10', emoji: '🔟', title: 'Zehn geschafft', text: '10 Blöcke erledigt', rarity: 'rare', test: (s) => s.blocksDone >= 10 },
  { key: 'early_5', emoji: '⚡', title: 'Schneller als gedacht', text: '5× früher fertig', rarity: 'rare', test: (s) => s.early >= 5 },
  { key: 'perfect_day', emoji: '🌟', title: 'Drei-Sterne-Tag', text: 'An einem Tag 3 Sterne', rarity: 'rare', test: (s) => s.perfectDays >= 1 },
  { key: 'energy_7', emoji: '🔋', title: 'Gut auf mich geachtet', text: 'An 7 Tagen Energie eingeschätzt', rarity: 'rare', test: (s) => s.energyDays >= 7 },
  { key: 'procrastinator', emoji: '🦸', title: 'Endlich erledigt!', text: 'Etwas geschafft, das 3× verschoben war', rarity: 'rare', test: (s) => s.procrastinationWins >= 1 },
  { key: 'closed_7', emoji: '🌙', title: 'Gute Abende', text: '7 Tage bewusst abgeschlossen', rarity: 'epic', test: (s) => s.closedDays >= 7 },
  { key: 'blocks_50', emoji: '🏅', title: 'Fünfzig!', text: '50 Blöcke erledigt', rarity: 'epic', test: (s) => s.blocksDone >= 50 },
  { key: 'streak_30', emoji: '🏆', title: 'Ein ganzer Monat', text: '30 Tage in Folge', rarity: 'epic', test: (s, p) => p.streak.max >= 30 },
  { key: 'set_complete', emoji: '📒', title: 'Album komplett', text: 'Ein Sticker-Set vollständig', rarity: 'epic', test: (s) => s.setsCompleted >= 1 },
  { key: 'blocks_200', emoji: '👑', title: 'Alltags-Königin', text: '200 Blöcke erledigt', rarity: 'legendary', test: (s) => s.blocksDone >= 200 },
  { key: 'level_10', emoji: '💫', title: 'Supernova', text: 'Level 10 erreicht', rarity: 'legendary', test: (s, p) => p.lifetime >= 3000 },
  { key: 'early_bird', emoji: '🐦', title: 'Früher Vogel', text: 'Einen Block vor 7 Uhr geschafft', rarity: 'rare', secret: true, test: (s) => s.earlyBird >= 1 },
  { key: 'night_owl', emoji: '🦉', title: 'Nachteule', text: 'Einen Block nach 22 Uhr geschafft', rarity: 'rare', secret: true, test: (s) => s.nightOwl >= 1 },
  { key: 'double_shift', emoji: '🚀', title: 'Durchstarterin', text: '10 Blöcke an einem Tag', rarity: 'epic', secret: true, test: (s) => s.maxDayBlocks >= 10 },
];

// ---- Vorlagen ----
export const TEMPLATES = [
  { title: 'Aufräumen', emoji: '🧹', dur: 30 }, { title: 'Wäsche', emoji: '👕', dur: 20 }, { title: 'Kochen', emoji: '🍲', dur: 45 },
  { title: 'Pause', emoji: '☕', dur: 15, kind: 'pause' }, { title: 'Pause', emoji: '🛋️', dur: 30, kind: 'pause' },
  { title: 'Duschen', emoji: '🚿', dur: 15 }, { title: 'Einkaufen', emoji: '🛒', dur: 45 }, { title: 'Bad putzen', emoji: '🧽', dur: 25 },
  { title: 'Anrufen', emoji: '📞', dur: 10 }, { title: 'Spazieren', emoji: '🚶', dur: 20 }, { title: 'Kind abholen', emoji: '🚗', dur: 20 },
  { title: 'Mails & Post', emoji: '✉️', dur: 15 }, { title: 'Sport', emoji: '🏃', dur: 30 }, { title: 'Spülmaschine', emoji: '🍽️', dur: 10 },
];
export const ROUTINES = [
  { key: 'morgen', title: 'Morgenroutine', emoji: '🌅', blocks: [
    { title: 'Wasser trinken & lüften', emoji: '💧', dur: 5 }, { title: 'Duschen & anziehen', emoji: '🚿', dur: 20 },
    { title: 'Frühstück', emoji: '🥣', dur: 20 }, { title: 'Kind fertig machen', emoji: '🧒', dur: 20 }] },
  { key: 'mittag', title: 'Mittags-Reset', emoji: '🔄', blocks: [
    { title: 'Küche klar machen', emoji: '🍽️', dur: 15 }, { title: 'Pause', emoji: '🛋️', dur: 20, kind: 'pause' }, { title: '10-Minuten-Aufräumen', emoji: '🧹', dur: 10 }] },
  { key: 'abend', title: 'Abendroutine', emoji: '🌙', blocks: [
    { title: 'Küche aufräumen', emoji: '🍽️', dur: 15 }, { title: 'Kind ins Bett', emoji: '🛁', dur: 30 },
    { title: 'Morgen vorbereiten', emoji: '🎒', dur: 10 }, { title: 'Zeit für mich', emoji: '🛋️', dur: 30, kind: 'pause' }] },
];
const DEFAULT_REWARDS = [
  { title: 'Serien-Abend', emoji: '🍿', cost: 80 }, { title: 'Bubble Tea', emoji: '🧋', cost: 120 },
  { title: 'Massage vom Partner', emoji: '💆', cost: 200 }, { title: 'Neues Buch', emoji: '📚', cost: 350 },
];

// Sanfter Tagesabschluss (Idee aus momo „Emotional Closure“, eigene Texte)
const CLOSINGS = [
  'Du hast heute so viel getragen. Das zählt – auch das, was niemand sieht.',
  'Nicht perfekt, sondern geschafft. Das ist mehr als genug.',
  'Morgen ist ein neuer Tag. Heute darfst du stolz sein und loslassen.',
  'Jeder kleine Schritt war ein echter Schritt. Schlaf gut. 🌙',
  'Du warst heute freundlich zu dir. Das ist die wichtigste Aufgabe.',
  'Was liegen geblieben ist, wartet geduldig. Du musst gerade gar nichts.',
  'Pausen gehören zum Plan. Du hast sie dir verdient.',
  'Ein Tag mit Struktur – und mit dir mittendrin. Gut gemacht.',
];

const STAR_STEPS = [1, 3, 5];
export const starsFor = (n) => STAR_STEPS.filter((x) => n >= x).length;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const clean = (s, n) => String(s == null ? '' : s).trim().slice(0, n);

// ---------------------------------------------------------------- Zustand
function profile(pid) {
  const db = getDb();
  if (!db.people.some((p) => p.id === pid)) throw httpError(404, 'Diese Person gibt es nicht.');
  db.fluss ||= {};
  const p = db.fluss[pid] ||= {
    coins: 0, lifetime: 0,
    streak: { current: 0, max: 0, last: null, shieldMonth: null },
    stickers: {}, achievements: {}, rewards: DEFAULT_REWARDS.map((r) => ({ id: newId('r'), ...r })), redeemed: [],
    energy: null, energyDays: [],
    stats: { blocksDone: 0, pausesDone: 0, early: 0, maxCombo: 0, perfectDays: 0, closedDays: 0, procrastinationWins: 0, redeemed: 0, setsCompleted: 0, earlyBird: 0, nightOwl: 0, maxDayBlocks: 0 },
    settings: { dayEnd: '21:00', autoNext: true, remind: true, morningAt: null },
    days: {},
  };
  return p;
}
function day(p, date) {
  return p.days[date] ||= { blocks: [], combo: 0, closed: false, earned: 0, rarIdx: 0 };
}
const today = () => ymdInTz(new Date(), tz());
function hhmmToMs(date, hhmm) {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  return zonedToUtc(y, m, d, h, mi, 0, tz()).getTime();
}

/** Effektive Serie: ein verpasster Tag kann im Monat einmal gerettet werden (momo „Streak Shield“). */
function streakView(p, date = today()) {
  const s = p.streak, y = addDaysYmd(date, -1), y2 = addDaysYmd(date, -2);
  const shieldAvailable = s.shieldMonth !== date.slice(0, 7);
  if (!s.last) return { current: 0, max: s.max, shieldAvailable, atRisk: false };
  if (s.last === date || s.last === y) return { current: s.current, max: s.max, shieldAvailable, atRisk: false, doneToday: s.last === date };
  if (s.last === y2 && shieldAvailable) return { current: s.current, max: s.max, shieldAvailable, atRisk: true };
  return { current: 0, max: s.max, shieldAvailable, atRisk: false };
}
function bumpStreak(p, date) {
  const s = p.streak;
  if (s.last === date) return { shieldUsed: false };
  let shieldUsed = false;
  if (s.last === addDaysYmd(date, -1)) s.current += 1;
  else if (s.last === addDaysYmd(date, -2) && s.current > 0 && s.shieldMonth !== date.slice(0, 7)) { s.current += 1; s.shieldMonth = date.slice(0, 7); shieldUsed = true; }
  else s.current = 1;
  s.last = date;
  s.max = Math.max(s.max, s.current);
  return { shieldUsed };
}

function award(p, coins) { p.coins += coins; p.lifetime += coins; }

function checkAchievements(p) {
  const unlocked = [];
  for (const a of ACHIEVEMENTS) {
    if (p.achievements[a.key]) continue;
    if (a.test(p.stats, p)) {
      p.achievements[a.key] = new Date().toISOString();
      const c = RARITY_COINS[a.rarity];
      award(p, c);
      unlocked.push({ key: a.key, emoji: a.emoji, title: a.title, text: a.text, rarity: a.rarity, coins: c });
    }
  }
  return unlocked;
}

function drawSticker(p, date, d, rng, forceRarity) {
  const setKey = setForDate(date);
  const set = SETS[setKey];
  const owned = p.stickers[setKey] ||= {};
  const missing = set.stickers.filter((x) => !owned[x]);
  const r = rng();
  let rarity = forceRarity || (r < 0.08 ? 'glitter' : r < 0.33 ? 'shiny' : 'normal');
  if (!missing.length) return { sticker: set.stickers[Math.floor(rng() * set.stickers.length)], rarity: 'normal', dupe: true, setKey };
  const sticker = missing[Math.floor(rng() * missing.length)];
  owned[sticker] = rarity;
  let setDone = false;
  if (missing.length === 1) { p.stats.setsCompleted += 1; setDone = true; }
  return { sticker, rarity, dupe: false, setKey, setDone };
}

// ---------------------------------------------------------------- Ansicht
function view(pid, date) {
  const p = profile(pid);
  const d = day(p, date);
  const lv = levelFor(p.lifetime);
  const setKey = setForDate(date);
  const doneCount = d.blocks.filter((b) => b.status === 'done').length;
  return {
    personId: pid,
    date,
    today: today(),
    coins: p.coins,
    lifetime: p.lifetime,
    level: lv,
    streak: streakView(p, today()),
    energy: p.energy && p.energy.date === today() ? p.energy.level : null,
    settings: p.settings,
    day: {
      blocks: d.blocks, combo: d.combo, closed: d.closed, earned: d.earned, stars: starsFor(doneCount), done: doneCount,
      starSteps: STAR_STEPS, closing: d.closing || null,
    },
    tomorrowCount: (p.days[addDaysYmd(date, 1)] || { blocks: [] }).blocks.filter((b) => b.status === 'todo').length,
    album: {
      current: setKey,
      sets: Object.entries(SETS).map(([key, s]) => ({ key, name: s.name, emoji: s.emoji, stickers: s.stickers, owned: p.stickers[key] || {} })),
    },
    achievements: ACHIEVEMENTS.map((a) => ({
      key: a.key, rarity: a.rarity, secret: !!a.secret, unlockedAt: p.achievements[a.key] || null,
      ...(a.secret && !p.achievements[a.key] ? { emoji: '❔', title: 'Geheim', text: 'Wird verraten, wenn du ihn findest' } : { emoji: a.emoji, title: a.title, text: a.text }),
    })),
    rewards: p.rewards,
    redeemed: p.redeemed.slice(-20),
    templates: TEMPLATES,
    routines: ROUTINES,
  };
}

// ---------------------------------------------------------------- Aktionen
function sanitizeBlock(b) {
  const title = clean(b.title, 80);
  if (!title) throw httpError(400, 'Wie heißt der Block?');
  const dur = Math.round(Number(b.dur));
  if (!(dur >= 5 && dur <= 480)) throw httpError(400, 'Dauer zwischen 5 Minuten und 8 Stunden, bitte.');
  return {
    id: newId('b'), title, emoji: clean(b.emoji, 8) || (b.kind === 'pause' ? '☕' : '⭐'), kind: b.kind === 'pause' ? 'pause' : 'task',
    dur, ext: 0, status: 'todo', at: TIME_RE.test(b.at || '') ? b.at : null, note: clean(b.note, 140) || null,
    postponeCount: Math.max(0, Math.min(99, parseInt(b.postponeCount, 10) || 0)),
  };
}

function nextFlexible(d, after) {
  const i = d.blocks.indexOf(after);
  return d.blocks.slice(i + 1).find((b) => b.status === 'todo' && !b.at) || null;
}

function startBlock(d, b, nowIso) {
  for (const x of d.blocks) if (x.status === 'now' && x !== b) { x.status = 'todo'; x.startedAt = null; }
  b.status = 'now'; b.startedAt = nowIso; b.ext = b.ext || 0;
}

export function completeBlock(pid, date, id, { now = new Date(), rng = Math.random } = {}) {
  const p = profile(pid), d = day(p, date);
  const b = d.blocks.find((x) => x.id === id);
  if (!b) throw httpError(404, 'Block nicht gefunden.');
  if (b.status === 'done') throw httpError(409, 'Schon erledigt.');
  const starsBefore = starsFor(d.blocks.filter((x) => x.status === 'done').length);
  const levelBefore = levelFor(p.lifetime).level;
  if (!b.startedAt) b.startedAt = new Date(now.getTime() - b.dur * 60000).toISOString();
  const plannedEnd = new Date(b.startedAt).getTime() + (b.dur + (b.ext || 0)) * 60000;
  const early = Math.round((plannedEnd - now.getTime()) / 60000);
  b.status = 'done'; b.doneAt = now.toISOString();

  d.combo += 1;
  const mult = d.combo >= 3 ? 2 : d.combo >= 2 ? 1.5 : 1;
  let coins = Math.round((b.kind === 'pause' ? 6 : 10) * mult);
  const bonus = [];
  if (early >= 3 && b.kind !== 'pause') { coins += 5; p.stats.early += 1; bonus.push(`${early} Min früher fertig`); }
  const procrastination = (b.postponeCount || 0) >= 3;
  if (procrastination) { coins *= 2; p.stats.procrastinationWins += 1; bonus.push('Endlich erledigt: doppelte Münzen'); }

  const rar = ['glitter', null, null, 'shiny', null, null, null][d.rarIdx++ % 7]; // die erste Belohnung des Tages glitzert
  const st = drawSticker(p, date, d, rng, rar || undefined);
  if (st.dupe) coins += 5;
  if (st.setDone) { coins += 100; bonus.push('Set komplett: +100'); }
  b.sticker = st.sticker; b.rarity = st.rarity; b.coins = coins;
  award(p, coins);
  d.earned += coins;

  p.stats.blocksDone += 1;
  if (b.kind === 'pause') p.stats.pausesDone += 1;
  p.stats.maxCombo = Math.max(p.stats.maxCombo, d.combo);
  const dayDone = d.blocks.filter((x) => x.status === 'done').length;
  p.stats.maxDayBlocks = Math.max(p.stats.maxDayBlocks, dayDone);
  const hour = localParts(now, tz()).h;
  if (hour < 7) p.stats.earlyBird += 1;
  if (hour >= 22) p.stats.nightOwl += 1;
  const starsAfter = starsFor(dayDone);
  if (starsAfter === 3 && starsBefore < 3) p.stats.perfectDays += 1;
  const { shieldUsed } = date === today() ? bumpStreak(p, date) : { shieldUsed: false };
  const achievements = checkAchievements(p);

  // Schwung mitnehmen: nächster flexibler Block startet automatisch
  let started = null;
  if (p.settings.autoNext !== false) {
    const nx = nextFlexible(d, b);
    if (nx) { startBlock(d, nx, now.toISOString()); started = { id: nx.id, title: nx.title, emoji: nx.emoji }; }
  }
  const levelAfter = levelFor(p.lifetime);
  save();
  return {
    reward: {
      coins, mult, early, procrastination, bonus, sticker: st.sticker, rarity: st.rarity, dupe: st.dupe, setDone: !!st.setDone,
      starsBefore, starsAfter, levelUp: levelAfter.level > levelBefore ? levelAfter : null, achievements, shieldUsed,
      streak: streakView(p, today()).current, started,
    },
    state: view(pid, date),
  };
}

export function closeDay(pid, date, { rng = Math.random } = {}) {
  const p = profile(pid), d = day(p, date);
  if (d.closed) throw httpError(409, 'Der Tag ist schon abgeschlossen.');
  const done = d.blocks.filter((b) => b.status === 'done').length;
  const stars = starsFor(done);
  d.closed = true;
  let coins = 15 + stars * 10;
  const st = drawSticker(p, date, d, rng, 'glitter');
  if (st.dupe) coins += 20;
  award(p, coins);
  d.earned += coins;
  p.stats.closedDays += 1;
  d.closing = CLOSINGS[(parseInt(date.replaceAll('-', ''), 10)) % CLOSINGS.length];
  const achievements = checkAchievements(p);
  save();
  return { reward: { coins, sticker: st.sticker, rarity: st.rarity, dupe: st.dupe, stars, closing: d.closing, achievements }, state: view(pid, date) };
}

// ---------------------------------------------------------------- API
export async function handle(req, res, url, { readBody, send }) {
  const m = /^\/api\/fluss\/([^/]+)(?:\/(.*))?$/.exec(url.pathname);
  if (!m) return false;
  const pid = decodeURIComponent(m[1]);
  const rest = m[2] || '';
  const method = req.method;
  const date = url.searchParams.get('date') || today();
  if (!isYmd(date)) throw httpError(400, 'Ungültiges Datum.');
  const p = profile(pid);
  const ok = (extra) => { save(); emitChange('fluss'); return send(res, 200, { ...(extra || {}), state: view(pid, date) }); };

  if (method === 'GET' && rest === '') return send(res, 200, { state: view(pid, date) });

  const b = method === 'GET' ? {} : await readBody(req);
  const d = day(p, date);
  const nowIso = new Date().toISOString();

  if (method === 'POST' && rest === 'blocks') {
    const list = Array.isArray(b.blocks) ? b.blocks : [b];
    if (list.length > 20) throw httpError(400, 'Zu viele Blöcke auf einmal.');
    const added = list.map(sanitizeBlock);
    const idx = Number.isInteger(b.index) ? Math.max(0, Math.min(d.blocks.length, b.index)) : d.blocks.length;
    d.blocks.splice(idx, 0, ...added);
    // Wenn gerade nichts läuft und es heute ist: nichts automatisch starten – sie entscheidet.
    return ok({ added: added.map((x) => x.id) });
  }

  const bm = /^blocks\/([^/]+)\/(start|done|extend|tomorrow|later|split|delete|up|down|edit)$/.exec(rest);
  if (method === 'POST' && bm) {
    const blk = d.blocks.find((x) => x.id === bm[1]);
    if (!blk) throw httpError(404, 'Block nicht gefunden.');
    const action = bm[2];
    if (action === 'done') {
      const r = completeBlock(pid, date, blk.id);
      emitChange('fluss');
      return send(res, 200, r);
    }
    if (action === 'start') startBlock(d, blk, nowIso);
    if (action === 'extend') blk.ext = Math.min(240, (blk.ext || 0) + (Number(b.min) || 10));
    if (action === 'tomorrow') {
      const wasNow = blk.status === 'now';
      blk.status = 'moved';
      const copy = { ...blk, id: newId('b'), status: 'todo', ext: 0, startedAt: null, doneAt: null, postponeCount: (blk.postponeCount || 0) + 1 };
      day(p, addDaysYmd(date, 1)).blocks.push(copy);
      if (wasNow && p.settings.autoNext !== false) { const nx = nextFlexible(d, blk); if (nx) startBlock(d, nx, nowIso); }
    }
    if (action === 'later') {
      // Hinter den nächsten offenen Block schieben (z. B. „Pause später“)
      const wasNow = blk.status === 'now';
      blk.status = 'todo'; blk.startedAt = null; blk.ext = 0;
      const i = d.blocks.indexOf(blk);
      const j = d.blocks.findIndex((x, k) => k > i && x.status === 'todo' && !x.at);
      if (j > i) { d.blocks.splice(i, 1); d.blocks.splice(j, 0, blk); }
      if (wasNow) { const nx = d.blocks.find((x) => x.status === 'todo' && !x.at && x !== blk); if (nx) startBlock(d, nx, nowIso); }
      blk.postponeCount = (blk.postponeCount || 0) + 1;
    }
    if (action === 'split') {
      // „Kleiner machen“: Block in zwei Hälften mit Mini-Pause dazwischen teilen
      if (blk.dur < 20) throw httpError(400, 'Der Block ist schon klein genug.');
      const half = Math.max(5, Math.round(blk.dur / 2 / 5) * 5);
      const i = d.blocks.indexOf(blk);
      const second = { ...blk, id: newId('b'), title: `${blk.title} (Teil 2)`, dur: blk.dur - half, status: 'todo', startedAt: null, ext: 0, at: null };
      const pause = { id: newId('b'), title: 'Mini-Pause', emoji: '🌿', kind: 'pause', dur: 5, ext: 0, status: 'todo', at: null, postponeCount: 0 };
      blk.title = `${blk.title} (Teil 1)`; blk.dur = half;
      d.blocks.splice(i + 1, 0, pause, second);
    }
    if (action === 'delete') d.blocks.splice(d.blocks.indexOf(blk), 1);
    if (action === 'up' || action === 'down') {
      const i = d.blocks.indexOf(blk), j = action === 'up' ? i - 1 : i + 1;
      if (j >= 0 && j < d.blocks.length) { d.blocks[i] = d.blocks[j]; d.blocks[j] = blk; }
    }
    if (action === 'edit') {
      const s = sanitizeBlock({ ...blk, ...b });
      Object.assign(blk, { title: s.title, emoji: s.emoji, dur: s.dur, at: s.at, kind: s.kind, note: s.note });
    }
    return ok();
  }

  if (method === 'POST' && rest === 'energy') {
    if (!['low', 'mid', 'high'].includes(b.level)) throw httpError(400, 'Energie: low, mid oder high.');
    p.energy = { date: today(), level: b.level };
    if (!p.energyDays.includes(today())) p.energyDays.push(today());
    p.energyDays = p.energyDays.slice(-60);
    p.stats.energyDays = p.energyDays.length;
    const achievements = checkAchievements(p);
    return ok({ achievements });
  }

  if (method === 'POST' && rest === 'close') {
    const r = closeDay(pid, date);
    emitChange('fluss');
    return send(res, 200, r);
  }

  if (method === 'POST' && rest === 'rewards') {
    const title = clean(b.title, 60), cost = Math.round(Number(b.cost));
    if (!title || !(cost >= 5 && cost <= 5000)) throw httpError(400, 'Name und Preis (5–5000 Münzen) bitte.');
    if (p.rewards.length >= 30) throw httpError(400, 'Höchstens 30 Belohnungen.');
    p.rewards.push({ id: newId('r'), title, emoji: clean(b.emoji, 8) || '🎁', cost });
    return ok();
  }
  const rm = /^rewards\/([^/]+)(?:\/(redeem))?$/.exec(rest);
  if (rm) {
    const r = p.rewards.find((x) => x.id === rm[1]);
    if (!r) throw httpError(404, 'Belohnung nicht gefunden.');
    if (method === 'DELETE' && !rm[2]) { p.rewards = p.rewards.filter((x) => x !== r); return ok(); }
    if (method === 'POST' && rm[2]) {
      if (p.coins < r.cost) throw httpError(400, `Dafür fehlen noch ${r.cost - p.coins} Münzen.`);
      p.coins -= r.cost;
      p.redeemed.push({ id: r.id, title: r.title, emoji: r.emoji, cost: r.cost, at: nowIso });
      p.stats.redeemed += 1;
      const achievements = checkAchievements(p);
      return ok({ achievements });
    }
  }

  if (method === 'POST' && rest === 'test-ntfy') {
    const person = getDb().people.find((x) => x.id === pid);
    if (!person.ntfyTopic) throw httpError(400, 'Bitte zuerst ein ntfy-Thema eintragen.');
    const n = getDb().settings.ntfy || {};
    try {
      await sendNtfy({ server: n.server, topic: person.ntfyTopic, title: `👋 Hallo ${person.name}!`, message: 'So sehen deine Tagesfluss-Erinnerungen aus. Du schaffst das 💛', tags: ['sparkles'] });
    } catch (e) { throw httpError(400, e.message); }
    return send(res, 200, { ok: true, state: view(pid, date) });
  }

  if (method === 'PUT' && rest === 'settings') {
    const s = p.settings;
    if ('dayEnd' in b) s.dayEnd = TIME_RE.test(b.dayEnd || '') ? b.dayEnd : '21:00';
    if ('autoNext' in b) s.autoNext = !!b.autoNext;
    if ('remind' in b) s.remind = !!b.remind;
    if ('morningAt' in b) s.morningAt = TIME_RE.test(b.morningAt || '') ? b.morningAt : null;
    if ('ntfyTopic' in b) {
      const person = getDb().people.find((x) => x.id === pid);
      person.ntfyTopic = clean(b.ntfyTopic, 64).replace(/[^A-Za-z0-9_-]/g, '') || undefined;
    }
    return ok();
  }

  throw httpError(404, 'Nicht gefunden.');
}

// ---------------------------------------------------------------- Erinnerungen (ntfy)
function rocksFor(pid, date) {
  const cals = Object.fromEntries(getDb().calendars.map((c) => [c.id, c]));
  return listEvents(date, date)
    .filter((e) => !e.allDay && (!e.people.length || e.people.includes(pid)))
    .filter((e) => { const c = cals[e.calendarId]; return !c || !c.kind || c.kind === 'normal'; })
    .map((e) => ({ id: e.calendarId + '|' + e.id, title: e.title, s: new Date(e.start).getTime(), e: new Date(e.end).getTime() }));
}

export function planFor(pid, date, now = Date.now()) {
  const p = profile(pid), d = day(p, date);
  return FWPlan.plan({
    now,
    dayEnd: hhmmToMs(date, p.settings.dayEnd || '21:00'),
    rocks: rocksFor(pid, date),
    blocks: d.blocks.map((b) => ({ ...b, startedAtMs: b.startedAt ? Date.parse(b.startedAt) : null, doneAtMs: b.doneAt ? Date.parse(b.doneAt) : null, atMs: b.at ? hhmmToMs(date, b.at) : null })),
  });
}

export function reminders(now = new Date()) {
  const db = getDb();
  if (!db.fluss) return [];
  const date = ymdInTz(now, tz());
  const out = [];
  db.reminderSent ||= {};
  for (const person of db.people) {
    const p = db.fluss[person.id];
    if (!p || !person.ntfyTopic || p.settings.remind === false) continue;
    const d = p.days[date];
    const once = (key, msg) => { if (!db.reminderSent[key]) { db.reminderSent[key] = now.toISOString(); out.push({ topic: person.ntfyTopic, ...msg }); } };
    // Morgen-Gruß
    if (p.settings.morningAt) {
      const lp = localParts(now, tz());
      const [mh, mm] = p.settings.morningAt.split(':').map(Number);
      if (lp.h * 60 + lp.mi >= mh * 60 + mm && lp.h < 12) {
        const todo = d ? d.blocks.filter((b) => b.status === 'todo') : [];
        const first = todo.slice().sort((a, b) => a.dur - b.dur)[0];
        once(`fl|${person.id}|morning|${date}`, {
          title: '☀️ Guten Morgen!',
          message: todo.length ? `${todo.length} Blöcke geplant. Fang mit etwas Kleinem an: ${first.emoji} ${first.title} (${first.dur} Min).` : 'Magst du dir 3 kleine Blöcke für heute überlegen? Ein Tipp reicht.',
          tags: ['sunny'],
        });
      }
    }
    if (!d || d.closed) continue;
    const pl = planFor(person.id, date, now.getTime());
    const cur = pl.current;
    const nxt = pl.next;
    const nextName = nxt ? (nxt.b ? `${nxt.b.emoji} ${nxt.b.title}` : `📅 ${nxt.rock.title}`) : null;
    if (cur && cur.type === 'block' && cur.state === 'now') {
      const left = (cur.e - now.getTime()) / 60000;
      const k = `fl|${person.id}|${cur.b.id}|${cur.b.ext || 0}`;
      if (left <= 10 && left > 0) once(k + '|w', { title: `⏳ Noch 10 Min: ${cur.b.emoji} ${cur.b.title}`, message: nextName ? `Danach: ${nextName}. Such dir schon mal einen guten Abschluss.` : 'Such dir schon mal einen guten Abschluss.', tags: ['hourglass'] });
      if (left <= 0) once(k + '|e', { title: `✨ Zeit ist um – super durchgehalten!`, message: `Tipp auf „Fertig“ bei ${cur.b.emoji} ${cur.b.title} und hol dir deinen Sticker 🎁`, tags: ['sparkles'] });
    }
    // Feste Termine und Blöcke mit Startzeit: 10 Minuten vorher
    for (const it of pl.items) {
      if (it.state !== 'todo' || (it.type !== 'rock' && !it.anchored)) continue;
      const until = (it.s - now.getTime()) / 60000;
      const name = it.rock ? `📅 ${it.rock.title}` : `${it.b.emoji} ${it.b.title}`;
      if (until <= 10 && until > 0) once(`fl|${person.id}|soon|${it.rock ? it.rock.id : it.b.id}|${it.s}`, { title: `In ${Math.max(1, Math.round(until))} Min: ${name}`, message: pl.buffer && pl.buffer.min >= 0 ? 'Du liegst gut in der Zeit. Kein Stress.' : 'Mach in Ruhe fertig – alles andere darf warten.', tags: ['alarm_clock'] });
    }
  }
  if (out.length) save();
  return out;
}

export function pruneOldDays() {
  const db = getDb();
  if (!db.fluss) return;
  const cut = addDaysYmd(today(), -60);
  for (const p of Object.values(db.fluss)) for (const k of Object.keys(p.days)) if (k < cut) delete p.days[k];
}
