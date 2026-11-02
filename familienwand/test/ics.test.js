import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIcs } from '../server/ics.js';
import { zonedToUtc, naiveToUtc } from '../server/tz.js';

const wrap = (body) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}\r\nEND:VCALENDAR\r\n`;
const win = { from: new Date('2026-10-01T00:00:00Z'), to: new Date('2027-01-31T00:00:00Z'), tz: 'Europe/Berlin' };

test('Zeitzonen: Sommer- und Winterzeit Berlin', () => {
  assert.equal(zonedToUtc(2026, 7, 1, 12, 0, 0, 'Europe/Berlin').toISOString(), '2026-07-01T10:00:00.000Z');
  assert.equal(zonedToUtc(2026, 12, 1, 12, 0, 0, 'Europe/Berlin').toISOString(), '2026-12-01T11:00:00.000Z');
  assert.equal(naiveToUtc('2026-10-25T03:30', 'Europe/Berlin').toISOString(), '2026-10-25T02:30:00.000Z');
});

test('Einzeltermin mit TZID und ganztägiger Termin', () => {
  const ev = parseIcs(wrap([
    'BEGIN:VEVENT', 'UID:a', 'SUMMARY:Elternabend\\, Kita', 'DTSTART;TZID=Europe/Berlin:20261110T193000', 'DTEND;TZID=Europe/Berlin:20261110T210000', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:b', 'SUMMARY:Laternenfest', 'DTSTART;VALUE=DATE:20261111', 'DTEND;VALUE=DATE:20261112', 'END:VEVENT',
  ].join('\r\n')), win);
  assert.equal(ev.length, 2);
  const a = ev.find((e) => e.title === 'Elternabend, Kita');
  assert.equal(a.start, '2026-11-10T18:30:00.000Z');
  assert.equal(a.end, '2026-11-10T20:00:00.000Z');
  const b = ev.find((e) => e.title === 'Laternenfest');
  assert.deepEqual([b.allDay, b.start, b.end], [true, '2026-11-11', '2026-11-12']);
});

test('Wöchentliche Wiederholung behält Ortszeit über die Zeitumstellung', () => {
  const ev = parseIcs(wrap([
    'BEGIN:VEVENT', 'UID:turnen', 'SUMMARY:Kinderturnen', 'DTSTART;TZID=Europe/Berlin:20261015T163000', 'DTEND;TZID=Europe/Berlin:20261015T173000',
    'RRULE:FREQ=WEEKLY;BYDAY=TH;COUNT=4', 'END:VEVENT',
  ].join('\r\n')), win);
  assert.deepEqual(ev.map((e) => e.start), [
    '2026-10-15T14:30:00.000Z', '2026-10-22T14:30:00.000Z', '2026-10-29T15:30:00.000Z', '2026-11-05T15:30:00.000Z',
  ]);
});

test('EXDATE und RECURRENCE-ID (verschobener Einzeltermin)', () => {
  const ev = parseIcs(wrap([
    'BEGIN:VEVENT', 'UID:x', 'SUMMARY:Schwimmen', 'DTSTART;TZID=Europe/Berlin:20261102T170000', 'DTEND;TZID=Europe/Berlin:20261102T180000',
    'RRULE:FREQ=WEEKLY;UNTIL=20261130T235959Z', 'EXDATE;TZID=Europe/Berlin:20261109T170000', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:x', 'RECURRENCE-ID;TZID=Europe/Berlin:20261116T170000', 'SUMMARY:Schwimmen (später)', 'DTSTART;TZID=Europe/Berlin:20261116T180000', 'DTEND;TZID=Europe/Berlin:20261116T190000', 'END:VEVENT',
  ].join('\r\n')), win);
  assert.deepEqual(ev.map((e) => `${e.start.slice(0, 10)} ${e.title}`), [
    '2026-11-02 Schwimmen', '2026-11-16 Schwimmen (später)', '2026-11-23 Schwimmen', '2026-11-30 Schwimmen',
  ]);
});

test('Monatlich: jeden 1. Montag und jährlicher Geburtstag', () => {
  const ev = parseIcs(wrap([
    'BEGIN:VEVENT', 'UID:m', 'SUMMARY:Elternrat', 'DTSTART;TZID=Europe/Berlin:20261005T200000', 'DURATION:PT1H30M', 'RRULE:FREQ=MONTHLY;BYDAY=1MO', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:g', 'SUMMARY:Geburtstag Oma', 'DTSTART;VALUE=DATE:19501203', 'RRULE:FREQ=YEARLY', 'END:VEVENT',
  ].join('\r\n')), win);
  assert.deepEqual(ev.filter((e) => e.title === 'Elternrat').map((e) => e.start.slice(0, 10)), ['2026-10-05', '2026-11-02', '2026-12-07', '2027-01-04']);
  const g = ev.filter((e) => e.title === 'Geburtstag Oma');
  assert.deepEqual(g.map((e) => e.start), ['2026-12-03']);
});

test('Gefaltete Zeilen und VALARM werden korrekt gelesen', () => {
  const ev = parseIcs(wrap([
    'BEGIN:VEVENT', 'UID:f', 'SUMMARY:Ein sehr langer', '  Titel', 'DTSTART:20261120T090000Z', 'DTEND:20261120T100000Z',
    'BEGIN:VALARM', 'TRIGGER:-PT15M', 'DESCRIPTION:Alarm', 'END:VALARM', 'END:VEVENT',
  ].join('\r\n')), win);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].title, 'Ein sehr langer Titel');
  assert.equal(ev[0].notes, '');
});
