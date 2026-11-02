import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ctx = { globalThis: {} };
ctx.globalThis = ctx;
vm.runInNewContext(fs.readFileSync(new URL('../public/parse.js', import.meta.url), 'utf8'), ctx);
const { parse } = ctx.FWParse;

// Montag, 2. November 2026, 10:00 Uhr
const NOW = new Date(2026, 10, 2, 10, 0);
const p = (s) => JSON.parse(JSON.stringify(parse(s, NOW)));

test('Wochentag mit Uhrzeit', () => {
  const r = p('Zahnarzt Mi 15 Uhr');
  assert.equal(r.title, 'Zahnarzt');
  assert.equal(r.date, '2026-11-04');
  assert.equal(r.time, '15:00');
  assert.equal(r.allDay, false);
});

test('Datum ohne Uhrzeit wird ganztägig', () => {
  const r = p('Oma Geburtstag 12.11.');
  assert.equal(r.title, 'Oma Geburtstag');
  assert.equal(r.date, '2026-11-12');
  assert.equal(r.allDay, true);
});

test('morgen, Uhrzeit mit Minuten und Dauer', () => {
  const r = p('Kita Elternabend morgen 19:30 für 2h');
  assert.equal(r.title, 'Kita Elternabend');
  assert.equal(r.date, '2026-11-03');
  assert.equal(r.time, '19:30');
  assert.equal(r.durationMin, 120);
});

test('Zeitspanne am Samstag', () => {
  const r = p('Fussball Sa 10-12 Uhr');
  assert.equal(r.title, 'Fussball');
  assert.equal(r.date, '2026-11-07');
  assert.equal(r.time, '10:00');
  assert.equal(r.endTime, '12:00');
  assert.equal(r.durationMin, 120);
});

test('mehrtägiger Urlaub', () => {
  const r = p('Urlaub Ostsee 20.12.-27.12.');
  assert.equal(r.title, 'Urlaub Ostsee');
  assert.equal(r.date, '2026-12-20');
  assert.equal(r.endDate, '2026-12-27');
  assert.equal(r.allDay, true);
});

test('Monatsname und Jahreswechsel', () => {
  assert.equal(p('Impfung 3. Februar').date, '2027-02-03');
  assert.equal(p('Konzert am 28. Nov um 20 Uhr').time, '20:00');
});

test('Uhrzeit ohne Datum: heute, wenn noch nicht vorbei, sonst morgen', () => {
  assert.equal(p('Anrufen 18 Uhr').date, '2026-11-02');
  assert.equal(p('Joggen 7:00').date, '2026-11-03');
});

test('„10.15 Uhr“ ist eine Uhrzeit, kein Datum', () => {
  const r = p('Termin Bank heute 10.15 Uhr');
  assert.equal(r.time, '10:15');
  assert.equal(r.date, '2026-11-02');
  assert.equal(r.title, 'Termin Bank');
});

test('nächsten Montag ist nicht heute', () => {
  assert.equal(p('Friseur nächsten Montag 9 Uhr').date, '2026-11-09');
  assert.equal(p('Friseur Montag 17 Uhr').date, '2026-11-02');
});

test('„so“ im Satz ist kein Sonntag', () => {
  const r = p('So viel aufräumen');
  assert.equal(r.date, null);
  assert.equal(r.title, 'So viel aufräumen');
  assert.equal(p('Brunch So. 11 Uhr').date, '2026-11-08');
});

test('@Person wird erkannt und aus dem Titel entfernt', () => {
  const r = p('Turnen @Kind Do 16:30');
  assert.deepEqual(r.people, ['Kind']);
  assert.equal(r.title, 'Turnen');
  assert.equal(r.date, '2026-11-05');
});

test('Text ohne Zeitangaben bleibt Titel', () => {
  const r = p('Geschenk für Lisa besorgen');
  assert.equal(r.title, 'Geschenk für Lisa besorgen');
  assert.equal(r.date, null);
  assert.equal(r.time, null);
});

test('von … bis mit Minuten', () => {
  const r = p('Arzt von 8:30 bis 9:15');
  assert.equal(r.time, '08:30');
  assert.equal(r.endTime, '09:15');
  assert.equal(r.durationMin, 45);
});

test('Anzahl wie „3-4 Kinder“ ist keine Uhrzeit', () => {
  const r = p('Geburtstag 3-4 Kinder Sa');
  assert.equal(r.time, null);
  assert.equal(r.allDay, true);
});
