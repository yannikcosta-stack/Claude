import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-'));
process.env.DATA_DIR = dir;
process.env.APP_PASSWORD = 'geheim';
const { start } = await import('../server/index.js');
const { server, stop } = start({ port: 0, sync: false });
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;
let cookie = '';
const call = async (method, p, body) => {
  const res = await fetch(base + p, { method, headers: { 'content-type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined });
  const j = await res.json().catch(() => null);
  return { status: res.status, body: j, res };
};

test.after(() => { stop(); fs.rmSync(dir, { recursive: true, force: true }); });

test('ohne Anmeldung gesperrt, falsches Passwort abgelehnt', async () => {
  assert.equal((await call('GET', '/api/bootstrap')).status, 401);
  assert.equal((await call('POST', '/api/login', { password: 'falsch' })).status, 401);
  const ok = await call('POST', '/api/login', { password: 'geheim' });
  assert.equal(ok.status, 200);
  cookie = ok.res.headers.get('set-cookie').split(';')[0];
  assert.equal((await call('GET', '/api/bootstrap')).status, 200);
});

test('Startzustand: Personen und lokaler Familienkalender', async () => {
  const b = (await call('GET', '/api/bootstrap')).body;
  assert.equal(b.people.length, 3);
  assert.equal(b.calendars[0].type, 'local');
  assert.equal(b.calendars[0].writable, true);
  assert.equal(b.google.configured, false);
});

test('Termin anlegen, lesen, ändern, löschen', async () => {
  const created = await call('POST', '/api/events', {
    calendarId: 'c_familie', title: 'Zahnarzt', allDay: false, start: '2026-11-04T15:00', end: '2026-11-04T16:00', people: ['p_mama', 'p_unbekannt'],
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.start, '2026-11-04T14:00:00.000Z');
  assert.deepEqual(created.body.people, ['p_mama']);

  const list = await call('GET', '/api/events?from=2026-11-04&to=2026-11-04');
  assert.equal(list.body.events.length, 1);
  assert.equal((await call('GET', '/api/events?from=2026-11-05&to=2026-11-06')).body.events.length, 0);

  const id = created.body.id;
  const upd = await call('PATCH', `/api/events/c_familie/${id}`, { title: 'Zahnarzt (Kontrolle)', allDay: true, date: '2026-11-05', endDate: '2026-11-06' });
  assert.equal(upd.status, 200);
  assert.deepEqual([upd.body.start, upd.body.end], ['2026-11-05', '2026-11-07']);

  assert.equal((await call('DELETE', `/api/events/c_familie/${id}`)).status, 200);
  assert.equal((await call('GET', '/api/events?from=2026-11-01&to=2026-11-30')).body.events.length, 0);
});

test('Titel-Regel ordnet Personen zu („Mama: …“)', async () => {
  await call('POST', '/api/events', { calendarId: 'c_familie', title: 'Mama: Yoga', allDay: true, date: '2026-11-10' });
  const ev = (await call('GET', '/api/events?from=2026-11-10&to=2026-11-10')).body.events[0];
  assert.deepEqual(ev.people, ['p_mama']);
});

test('Eingaben werden geprüft', async () => {
  assert.equal((await call('POST', '/api/events', { calendarId: 'c_familie', title: '', allDay: true, date: '2026-11-10' })).status, 400);
  assert.equal((await call('POST', '/api/events', { calendarId: 'c_familie', title: 'x', allDay: true, date: '2026-02-30' })).status, 400);
  assert.equal((await call('POST', '/api/events', { calendarId: 'nix', title: 'x', allDay: true, date: '2026-11-10' })).status, 404);
  assert.equal((await call('POST', '/api/google/key', { type: 'user' })).status, 400);
});

test('Personen und Einstellungen speichern', async () => {
  const r = await call('PUT', '/api/people', { people: [{ id: 'p_papa', name: 'Yannik', emoji: '🧔', color: '#2F86D8' }, { name: 'Lina', emoji: '👧', color: 'rot' }] });
  assert.equal(r.status, 200);
  assert.equal(r.body.people[1].color, '#7B5BD6');
  const s = await call('PUT', '/api/settings', { familyName: 'Familie Costa', nightFrom: '21:30', ntfy: { enabled: true, topic: 'costa familie!', minutesBefore: 2 } });
  assert.equal(s.body.settings.familyName, 'Familie Costa');
  assert.equal(s.body.settings.ntfy.topic, 'costafamilie');
  assert.equal(s.body.settings.ntfy.minutesBefore, 5);
});

test('Wand- und Handy-Ansicht werden ausgeliefert', async () => {
  const wall = await fetch(base + '/wall').then((r) => r.text());
  assert.match(wall, /data-mode="wall"/);
  assert.match(wall, /wall\.webmanifest/);
  const res = await fetch(base + '/../server/index.js');
  assert.notEqual(res.status, 200);
});
