import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fwfl-'));
process.env.DATA_DIR = dir;
process.env.APP_PASSWORD = '';
const { start } = await import('../server/index.js');
const store = await import('../server/store.js');
const fluss = await import('../server/fluss.js');
const { ymdInTz, addDaysYmd } = await import('../server/tz.js');
const { server, stop } = start({ port: 0, sync: false });
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}/api/fluss/p_mama`;
const call = async (method, p, body) => {
  const res = await fetch(base + p, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json() };
};
const today = ymdInTz(new Date(), 'Europe/Berlin');
test.after(() => { stop(); fs.rmSync(dir, { recursive: true, force: true }); });

let st;
test('Leerer Tag mit Startwerten (momo-Level, Belohnungen, Vorlagen)', async () => {
  const r = await call('GET', '');
  assert.equal(r.status, 200);
  st = r.body.state;
  assert.equal(st.coins, 0);
  assert.equal(st.level.level, 1);
  assert.equal(st.level.next, 50);
  assert.equal(st.rewards.length, 4);
  assert.ok(st.templates.length >= 10);
  assert.equal(st.achievements.find((a) => a.key === 'night_owl').title, 'Geheim');
  assert.equal((await call('GET', '/../p_niemand'.replace('/..', ''))).status, 404);
});

test('Routine einplanen, starten, fertig: Münzen, Sticker, Combo, Sterne, Auto-Start', async () => {
  const r = await call('POST', '/blocks', { blocks: st.routines[0].blocks });
  assert.equal(r.body.state.day.blocks.length, 4);
  const [a, b] = r.body.state.day.blocks;
  await call('POST', `/blocks/${a.id}/start`);
  const d1 = await call('POST', `/blocks/${a.id}/done`);
  assert.equal(d1.status, 200);
  const rw = d1.body.reward;
  assert.equal(rw.rarity, 'glitter', 'erste Belohnung des Tages glitzert');
  assert.ok(rw.coins >= 10);
  assert.equal(rw.starsAfter, 1);
  assert.equal(rw.started.id, b.id, 'nächster Block startet automatisch');
  assert.ok(rw.achievements.some((x) => x.key === 'first_block'));
  assert.equal(d1.body.state.streak.current, 1);
  const d2 = (await call('POST', `/blocks/${b.id}/done`)).body;
  assert.equal(d2.reward.mult, 1.5);
  const c = d2.state.day.blocks[2];
  const d3 = (await call('POST', `/blocks/${c.id}/done`)).body;
  assert.equal(d3.reward.mult, 2);
  assert.equal(d3.reward.starsAfter, 2);
  assert.ok(d3.reward.achievements.some((x) => x.key === 'combo_3'));
  assert.equal((await call('POST', `/blocks/${c.id}/done`)).status, 409);
  st = d3.state;
  assert.ok(st.lifetime >= 50 && st.level.level >= 2, 'Level 2 ab 50 Münzen');
});

test('+10 Min, Kleiner machen, Später', async () => {
  const r = await call('POST', '/blocks', { title: 'Steuerkram', emoji: '📚', dur: 60 });
  const id = r.body.added[0];
  await call('POST', `/blocks/${id}/extend`, { min: 10 });
  let blk = (await call('GET', '')).body.state.day.blocks.find((x) => x.id === id);
  assert.equal(blk.ext, 10);
  const s = (await call('POST', `/blocks/${id}/split`)).body.state.day.blocks;
  const i = s.findIndex((x) => x.id === id);
  assert.deepEqual([s[i].title, s[i].dur, s[i + 1].title, s[i + 2].dur], ['Steuerkram (Teil 1)', 30, 'Mini-Pause', 30]);
  assert.equal((await call('POST', `/blocks/${s[i + 1].id}/split`)).status, 400);
});

test('3× verschoben → doppelte Münzen beim Erledigen (momo)', async () => {
  const r = await call('POST', '/blocks', { title: 'Arzttermin ausmachen', emoji: '📞', dur: 10, postponeCount: 2 });
  const id = r.body.added[0];
  const t = await call('POST', `/blocks/${id}/tomorrow`);
  assert.equal(t.body.state.day.blocks.find((x) => x.id === id).status, 'moved');
  assert.equal(t.body.state.tomorrowCount, 1);
  const tomorrow = addDaysYmd(today, 1);
  const tm = (await call('GET', `?date=${tomorrow}`)).body.state.day.blocks[0];
  assert.equal(tm.postponeCount, 3);
  const done = (await call('POST', `/blocks/${tm.id}/done?date=${tomorrow}`)).body.reward;
  assert.equal(done.procrastination, true);
  assert.ok(done.achievements.some((x) => x.key === 'procrastinator'));
});

test('Serie mit Monats-Joker (momo „Streak Shield“)', () => {
  const p = store.getDb().fluss.p_mama;
  p.streak = { current: 5, max: 5, last: addDaysYmd(today, -2), shieldMonth: null };
  p.days[today].blocks.push({ id: 'bx', title: 'Joker-Test', emoji: '⭐', kind: 'task', dur: 5, ext: 0, status: 'todo' });
  const r = fluss.completeBlock('p_mama', today, 'bx', { rng: () => 0.9 });
  assert.equal(r.reward.shieldUsed, true);
  assert.equal(r.state.streak.current, 6);
  assert.equal(r.state.streak.shieldAvailable, false);
  // zweite Lücke im selben Monat: Serie beginnt neu
  p.streak.last = addDaysYmd(today, -2);
  p.days[today].blocks.push({ id: 'by', title: 'Neu', emoji: '⭐', kind: 'task', dur: 5, ext: 0, status: 'todo' });
  assert.equal(fluss.completeBlock('p_mama', today, 'by', { rng: () => 0.9 }).state.streak.current, 1);
});

test('Belohnung einlösen senkt Münzen, aber nicht das Level', async () => {
  const before = (await call('GET', '')).body.state;
  const cheap = before.rewards.find((r) => r.cost <= before.coins);
  const r = await call('POST', `/rewards/${cheap.id}/redeem`);
  assert.equal(r.status, 200);
  const achCoins = r.body.achievements.reduce((a, x) => a + x.coins, 0); // „Gönn dir“ schreibt 10 gut
  assert.equal(r.body.state.coins, before.coins - cheap.cost + achCoins);
  assert.equal(r.body.state.level.level, before.level.level);
  assert.ok(r.body.achievements.some((x) => x.key === 'first_reward'));
  const big = before.rewards.find((x) => x.cost > 5000) || { id: (await call('POST', '/rewards', { title: 'Weltreise', emoji: '🌍', cost: 5000 })).body.state.rewards.at(-1).id };
  assert.equal((await call('POST', `/rewards/${big.id}/redeem`)).status, 400);
});

test('Tag abschließen: Truhe mit Glitzer-Sticker und sanftem Abschluss', async () => {
  const r = await call('POST', '/close');
  assert.equal(r.status, 200);
  assert.equal(r.body.reward.rarity === 'glitter' || r.body.reward.dupe, true);
  assert.ok(r.body.reward.closing.length > 10);
  assert.equal(r.body.state.day.closed, true);
  assert.equal((await call('POST', '/close')).status, 409);
});

test('Erinnerungen: 10 Min vor Blockende und vor Familienterminen an das eigene Thema', async () => {
  const db = store.getDb();
  db.people.find((p) => p.id === 'p_mama').ntfyTopic = 'fluss-test';
  const date = addDaysYmd(today, 3);
  const d = db.fluss.p_mama.days[date] = { blocks: [], combo: 0, closed: false, earned: 0, rarIdx: 0 };
  const now = new Date();
  d.blocks.push({ id: 'r1', title: 'Wäsche', emoji: '👕', kind: 'task', dur: 30, ext: 0, status: 'now', startedAt: new Date(now.getTime() - 22 * 60000).toISOString() });
  d.blocks.push({ id: 'r2', title: 'Pause', emoji: '☕', kind: 'pause', dur: 15, ext: 0, status: 'todo' });
  const { tz } = await import('../server/calendar.js');
  // Reminder-Logik arbeitet auf „heute“ – Datum für den Test umhängen
  const real = ymdInTz(now, tz());
  db.fluss.p_mama.days[real] = d;
  db.fluss.p_mama.days[real].closed = false;
  const out = fluss.reminders(now);
  assert.ok(out.some((m) => m.topic === 'fluss-test' && /Noch 10 Min/.test(m.title) && /Pause/.test(m.message)), JSON.stringify(out));
  assert.equal(fluss.reminders(now).length, 0, 'nur einmal');
});
