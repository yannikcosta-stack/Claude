import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/flussplan.js';

const { plan, mood } = globalThis.FWPlan;
const T = (h, m = 0) => Date.UTC(2026, 10, 2, h, m);
const hm = (ms) => new Date(ms).toISOString().slice(11, 16);

const base = () => ({
  now: T(14, 5),
  dayEnd: T(21, 0),
  rocks: [{ id: 'oma', title: 'Oma kommt', s: T(16), e: T(17, 30) }],
  blocks: [
    { id: 1, title: 'Frühstück', kind: 'task', dur: 30, status: 'done', startedAtMs: T(7, 30), doneAtMs: T(8, 2) },
    { id: 2, title: 'Aufräumen', kind: 'task', dur: 60, ext: 0, status: 'now', startedAtMs: T(13, 30) },
    { id: 3, title: 'Pause', kind: 'pause', dur: 30, status: 'todo' },
    { id: 4, title: 'Einkaufsliste', kind: 'task', dur: 15, status: 'todo' },
    { id: 5, title: 'Kochen', kind: 'task', dur: 45, status: 'todo', atMs: T(17, 45) },
  ],
});

test('Beispieltag aus dem Mockup: 45 Min Luft bis Oma', () => {
  const p = plan(base());
  assert.equal(p.current.b.id, 2);
  assert.equal(p.next.b.id, 3);
  assert.equal(p.buffer.min, 45);
  assert.equal(p.buffer.before.rock.id, 'oma');
  const order = p.items.map((i) => (i.type === 'gap' ? `gap${i.min}` : i.b ? i.b.title : i.rock.title));
  assert.deepEqual(order, ['Frühstück', 'Aufräumen', 'Pause', 'Einkaufsliste', 'gap45', 'Oma kommt', 'gap15', 'Kochen']);
  const pause = p.items.find((i) => i.b && i.b.id === 3);
  assert.equal(hm(pause.s), '14:30');
  assert.equal(mood(p.buffer.min), 'good');
});

test('+10 Min verlängern verkleinert den Puffer', () => {
  const inp = base();
  inp.blocks[1].ext = 10;
  assert.equal(plan(inp).buffer.min, 35);
});

test('Block, der nicht mehr vor den Termin passt, rutscht danach – mit Hinweis', () => {
  const inp = base();
  inp.blocks.splice(4, 0, { id: 6, title: 'Bad putzen', kind: 'task', dur: 60, status: 'todo' });
  const p = plan(inp);
  assert.equal(p.buffer.min, 45);
  assert.deepEqual(p.buffer.pushed, ['Bad putzen']);
  const bad = p.items.find((i) => i.b && i.b.id === 6);
  // passt weder vor Oma (16:00) noch zwischen Oma und Kochen (17:30–17:45) → nach dem Kochen
  assert.equal(hm(bad.s), '18:30');
});

test('Überzogener Block schiebt alles nach hinten, ohne Strafe', () => {
  const inp = base();
  inp.now = T(14, 50); // Aufräumen sollte um 14:30 fertig sein
  const p = plan(inp);
  assert.equal(p.current.b.id, 2);
  assert.equal(p.buffer.min, 25);
  assert.equal(mood(25), 'tight');
});

test('Läuft gerade ein Termin, ist er „live“ und Blöcke kommen danach', () => {
  const inp = base();
  inp.now = T(16, 30);
  inp.blocks[1].status = 'done'; inp.blocks[1].doneAtMs = T(14, 20);
  inp.blocks[2].status = 'done'; inp.blocks[2].doneAtMs = T(14, 50);
  inp.blocks[3].status = 'done'; inp.blocks[3].doneAtMs = T(15, 0);
  inp.blocks.push({ id: 7, title: 'Wäsche', kind: 'task', dur: 20, status: 'todo' });
  const p = plan(inp);
  assert.equal(p.current.type, 'rock');
  assert.equal(p.current.state, 'live');
  const w = p.items.find((i) => i.b && i.b.id === 7);
  assert.equal(hm(w.s), '18:30'); // 20 Min passen nicht in 17:30–17:45
  inp.blocks[5].dur = 10;
  const w2 = plan(inp).items.find((i) => i.b && i.b.id === 7);
  assert.equal(hm(w2.s), '17:30');
});

test('Ohne Termine: Luft bis Feierabend, auch negativ', () => {
  const p = plan({ now: T(20, 0), dayEnd: T(21, 0), rocks: [], blocks: [{ id: 1, title: 'Steuer', kind: 'task', dur: 90, status: 'todo' }] });
  assert.equal(p.buffer.end, T(21, 0));
  assert.equal(p.buffer.min, -30);
  assert.equal(mood(-30), 'over');
});

test('Verschobene Blöcke tauchen nicht auf', () => {
  const inp = base();
  inp.blocks[3].status = 'moved';
  assert.equal(plan(inp).buffer.min, 60);
});

test('Familientermin nach Feierabend zählt nicht als „zu viel geplant“', () => {
  const p = plan({ now: T(19, 0), dayEnd: T(21, 0), rocks: [{ id: 'x', title: 'Elternabend', s: T(20), e: T(23) }], blocks: [{ id: 1, title: 'Pause', kind: 'pause', dur: 20, status: 'todo' }] });
  assert.equal(p.end.min, 100);
});
