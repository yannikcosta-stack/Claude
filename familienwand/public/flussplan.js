/* Tagesfluss: plant die Blöcke des Tages um feste Termine („Felsen“) herum
   und berechnet, wie viel Luft bleibt. Klassisches Skript – läuft im Browser
   (window.FWPlan) und auf dem Server (globalThis.FWPlan), damit Anzeige und
   Erinnerungen immer dasselbe rechnen. Alle Zeiten in Millisekunden. */
(function (root) {
  'use strict';
  var MIN = 60000;

  function isFlexible(b) { return !b.atMs; }

  /**
   * input = {
   *   blocks: [{ id, title, emoji, kind:'task'|'pause', dur, ext, status:'todo'|'now'|'done'|'moved', startedAtMs, doneAtMs, atMs }],
   *   rocks:  [{ id, title, emoji, s, e }]   // feste Termine aus dem Familienkalender
   *   now, dayEnd                             // ms
   * }
   * Ergebnis: { items: [...], current, next, buffer }
   *   item = { type:'block'|'rock'|'gap', s, e, b?, rock?, min?, pushed? , state:'done'|'now'|'todo'|'past'|'live' }
   */
  function plan(input) {
    var now = input.now, items = [], cur = now;
    var blocks = (input.blocks || []).filter(function (b) { return b.status !== 'moved'; });
    var rocks = (input.rocks || []).slice();

    // 1) Erledigtes und vergangene Termine
    var past = [];
    blocks.forEach(function (b) {
      if (b.status !== 'done') return;
      var e = b.doneAtMs || now, s = b.startedAtMs || (e - b.dur * MIN);
      past.push({ type: 'block', b: b, s: s, e: e, state: 'done' });
    });
    rocks.forEach(function (r) { if (r.e <= now) past.push({ type: 'rock', rock: r, s: r.s, e: r.e, state: 'past' }); });
    past.sort(function (a, b) { return a.s - b.s; });
    items = items.concat(past);

    // 2) Der laufende Block
    var running = null;
    blocks.forEach(function (b) { if (b.status === 'now') running = b; });
    if (running) {
      var rs = running.startedAtMs || now, re = rs + (running.dur + (running.ext || 0)) * MIN;
      items.push({ type: 'block', b: running, s: rs, e: re, state: 'now' });
      cur = Math.max(re, now);
    }

    // 3) Felsen der Zukunft: Termine + Blöcke mit fester Startzeit
    var future = rocks.filter(function (r) { return r.e > now; }).map(function (r) {
      return { type: 'rock', rock: r, s: r.s, e: r.e, state: r.s <= now ? 'live' : 'todo' };
    });
    blocks.forEach(function (b) {
      if (b.status === 'todo' && !isFlexible(b)) future.push({ type: 'block', b: b, s: b.atMs, e: b.atMs + (b.dur + (b.ext || 0)) * MIN, state: 'todo', anchored: true });
    });
    future.sort(function (a, b) { return a.s - b.s; });

    var ri = 0, pendingPushed = [], lastBlockEnd = running ? Math.max(cur, now) : now;
    function pushRock(r) {
      var gap = Math.round((r.s - cur) / MIN);
      if (r.s > now && (gap !== 0 || pendingPushed.length)) items.push({ type: 'gap', s: cur, e: r.s, min: gap, before: r, pushed: pendingPushed });
      pendingPushed = [];
      items.push(r);
      // Wenn der Felsen schon läuft oder vor uns liegt, sind wir danach erst wieder frei
      if (r.e > cur) cur = Math.max(cur, r.e);
    }

    // 4) Flexible Blöcke der Reihe nach einsortieren
    blocks.forEach(function (b) {
      if (b.status !== 'todo' || !isFlexible(b)) return;
      var d = (b.dur + (b.ext || 0)) * MIN;
      for (;;) {
        // Felsen, die schon begonnen haben, zuerst ablegen
        while (ri < future.length && future[ri].s <= cur) pushRock(future[ri++]);
        // Passt der Block noch vor den nächsten Felsen?
        if (ri < future.length && cur + d > future[ri].s) {
          pendingPushed.push(b.title);
          pushRock(future[ri++]);
          continue;
        }
        break;
      }
      items.push({ type: 'block', b: b, s: cur, e: cur + d, state: 'todo' });
      cur += d;
      lastBlockEnd = Math.max(lastBlockEnd, cur);
    });
    while (ri < future.length) pushRock(future[ri++]);
    future.forEach(function (r) { if (r.type === 'block') lastBlockEnd = Math.max(lastBlockEnd, r.e); });

    // 5) Feierabend
    var endItem = null;
    if (input.dayEnd) {
      // Nur die eigenen Blöcke zählen – ein Familientermin bis 23 Uhr ist kein „zu viel geplant“
      endItem = { type: 'end', s: input.dayEnd, e: input.dayEnd, min: Math.round((input.dayEnd - lastBlockEnd) / MIN) };
    }

    // Fokus: was ist jetzt dran, was kommt als Nächstes?
    var current = null, next = null, buffer = null;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.type === 'gap') continue;
      if (it.state === 'done' || it.state === 'past') continue;
      if (!current) { current = it; continue; }
      if (!next) { next = it; break; }
    }
    // Puffer = erste Lücke ab jetzt vor einem Termin, sonst Luft bis Feierabend
    for (i = 0; i < items.length; i++) {
      if (items[i].type === 'gap' && items[i].e > now) { buffer = { min: items[i].min, before: items[i].before, pushed: items[i].pushed }; break; }
    }
    if (!buffer && endItem) buffer = { min: endItem.min, before: null, end: input.dayEnd };

    return { items: items, current: current, next: next, buffer: buffer, end: endItem };
  }

  /** Grün, gelb oder (sanft) orange – nie rot. */
  function mood(min) { return min >= 30 ? 'good' : min >= 10 ? 'tight' : 'over'; }

  var api = { plan: plan, mood: mood };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.FWPlan = api;
})(typeof window !== 'undefined' ? window : globalThis);
