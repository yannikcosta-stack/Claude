/* Familienwand – Oberfläche für Handy und Family Wall.
   Bewusst ohne Build-Schritt und ohne neueste JS-Syntax (kein ?. / ??),
   damit es auch auf älteren Tablets läuft. */
(function () {
  'use strict';

  var MODE = document.documentElement.getAttribute('data-mode');
  if (MODE !== 'wall' && MODE !== 'fluss') MODE = 'mobile';
  var S = { boot: null, events: [], weather: null, filter: 'all', offline: false, loading: false, nightWake: 0 };
  var FAMILY_COLOR = '#169C68';
  var PALETTE = ['#D3367A', '#2F86D8', '#E9A70E', '#169C68', '#E5763A', '#7B5BD6', '#0F9AA8', '#5B6B82'];
  var WD_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  var WD_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  var MON_SHORT = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'];
  var MON_LONG = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

  // ---------------------------------------------------------------- Hilfen
  function $(s, el) { return (el || document).querySelector(s); }
  function $$(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseYmd(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function today() { var n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }
  function hm(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } return null; }
  function vibrate(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* egal */ } }
  function hexRgba(hex, a) {
    var h = (hex || FAMILY_COLOR).replace('#', '');
    return 'rgba(' + parseInt(h.substr(0, 2), 16) + ',' + parseInt(h.substr(2, 2), 16) + ',' + parseInt(h.substr(4, 2), 16) + ',' + a + ')';
  }
  function isDark() { var t = document.documentElement.getAttribute('data-theme'); return t ? t === 'dark' : window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches; }
  function tint(hex) { return hexRgba(hex, isDark() ? 0.28 : 0.16); }

  var ICONS = {
    gear: '<path d="M12 15a3 3 0 100-6 3 3 0 000 6z"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
    sync: '<path d="M21 12a9 9 0 01-15.5 6.2L3 16M3 12a9 9 0 0115.5-6.2L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>',
    close: '<path d="M18 6L6 18M6 6l12 12"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
  };
  function icon(n) { return '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[n] + '</svg>'; }

  function dayLabel(d, long) {
    var t = today(), diff = Math.round((d - t) / 86400000);
    var base = (long ? WD_LONG[d.getDay()] : WD_SHORT[d.getDay()]) + ', ' + d.getDate() + '. ' + (long ? MON_LONG[d.getMonth()] : MON_SHORT[d.getMonth()]);
    if (diff === 0) return 'Heute';
    if (diff === 1) return 'Morgen';
    if (diff === -1) return 'Gestern';
    return base;
  }
  function dateLong(d) { return WD_LONG[d.getDay()] + ', ' + d.getDate() + '. ' + MON_LONG[d.getMonth()]; }

  // ---------------------------------------------------------------- Server
  function api(method, path, body) {
    return fetch(path, {
      method: method, credentials: 'same-origin',
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (res) {
      S.offline = res.headers.get('x-fw-offline') === '1';
      return res.json().catch(function () { return {}; }).then(function (j) {
        if (res.status === 401 && j.authRequired) { S.needLogin = true; showLogin(); throw new Error('Bitte anmelden.'); }
        if (!res.ok) throw new Error(j.error || ('Fehler ' + res.status));
        return j;
      });
    }, function () { S.offline = true; throw new Error('Keine Verbindung zum Server.'); });
  }

  // ---------------------------------------------------------------- Daten
  function person(id) { var p = S.boot.people; for (var i = 0; i < p.length; i++) if (p[i].id === id) return p[i]; return null; }
  function calendar(id) { var c = S.boot.calendars; for (var i = 0; i < c.length; i++) if (c[i].id === id) return c[i]; return null; }
  function calColor(c) { if (!c) return FAMILY_COLOR; if (c.color) return c.color; var p = c.personId && person(c.personId); return p ? p.color : FAMILY_COLOR; }
  function evPeople(ev) { var out = []; (ev.people || []).forEach(function (id) { var p = person(id); if (p) out.push(p); }); return out; }
  function evColor(ev) { var ps = evPeople(ev); return ps.length === 1 ? ps[0].color : calColor(calendar(ev.calendarId)); }
  function evKind(ev) { var c = calendar(ev.calendarId); return c && c.kind ? c.kind : 'normal'; }
  function evStart(ev) { return ev.allDay ? parseYmd(ev.start) : new Date(ev.start); }
  function evEnd(ev) { return ev.allDay ? parseYmd(ev.end) : new Date(ev.end); }
  function avatars(ev, size) {
    var k = evKind(ev);
    if (k === 'waste') return '<span class="av" style="' + (size ? 'width:' + size + ';height:' + size : '') + '">🗑️</span>';
    if (k === 'holiday') return '<span class="av">🎉</span>';
    var ps = evPeople(ev);
    if (!ps.length) return '<span class="av" title="Familie" style="background:' + tint(evColor(ev)) + '">👨‍👩‍👧</span>';
    return ps.map(function (p) { return '<span class="av" title="' + esc(p.name) + '" style="background:' + tint(p.color) + '">' + esc(p.emoji) + '</span>'; }).join('');
  }
  function eventsOn(day) {
    var s = day, e = addDays(day, 1);
    return S.events.filter(function (ev) { return evStart(ev) < e && evEnd(ev) > s; });
  }
  function matchesFilter(ev) {
    if (S.filter === 'all') return true;
    var ids = ev.people || [];
    return ids.length === 0 || ids.indexOf(S.filter) >= 0;
  }
  function writableCalendars() { return S.boot.calendars.filter(function (c) { return c.writable && c.kind !== 'waste' && c.kind !== 'holiday'; }); }
  function defaultCalendar() {
    var w = writableCalendars();
    for (var i = 0; i < w.length; i++) if (w[i].isDefault) return w[i];
    for (i = 0; i < w.length; i++) if (!w[i].personId) return w[i];
    return w[0] || null;
  }

  function range() {
    var t = today();
    if (MODE === 'fluss') return { from: addDays(t, -1), to: addDays(t, 2) };
    return MODE === 'wall' ? { from: addDays(t, -1), to: addDays(t, 15) } : { from: addDays(t, -1), to: addDays(t, 75) };
  }

  function loadAll() {
    return api('GET', '/api/bootstrap').then(function (b) { S.boot = b; return loadEvents(); });
  }
  function loadEvents() {
    var r = range();
    return api('GET', '/api/events?from=' + ymd(r.from) + '&to=' + ymd(r.to)).then(function (j) { S.events = j.events; render(); });
  }
  function loadWeather() {
    if (!S.boot || !S.boot.settings.weather) { S.weather = null; return; }
    api('GET', '/api/weather').then(function (j) { S.weather = j.weather; if (MODE === 'wall') render(); }, function () { /* egal */ });
  }

  var reloadTimer = null;
  function scheduleReload(full) {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(function () { (full ? loadAll() : loadEvents()).catch(function () { render(); }); }, 300);
  }
  function connectLive() {
    if (!window.EventSource) return;
    var es = new EventSource('/api/stream');
    es.addEventListener('change', function (e) {
      var r = '';
      try { r = JSON.parse(e.data).reason; } catch (x) { /* egal */ }
      if (r === 'fluss') { if (MODE === 'fluss' && window.FWFluss) window.FWFluss.reload(); return; }
      scheduleReload(r === 'people' || r === 'calendars' || r === 'settings');
      if (r === 'settings') loadWeather();
    });
  }

  // ---------------------------------------------------------------- Toast
  var toastTimer;
  function toast(msg, action, fn) {
    var t = $('#toast');
    t.innerHTML = '<span>' + esc(msg) + '</span>' + (action ? '<button type="button">' + esc(action) + '</button>' : '<span class="sp"></span>');
    t.classList.add('show');
    if (action) t.querySelector('button').onclick = function () { t.classList.remove('show'); fn(); };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, action ? 6000 : 2600);
  }

  // ---------------------------------------------------------------- Sheets
  function openSheet(html, opts) {
    opts = opts || {};
    var ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = '<div class="sheet' + (opts.full ? ' full' : '') + '" role="dialog" aria-modal="true">' + html + '</div>';
    $('#sheets').appendChild(ov);
    // eslint-disable-next-line no-unused-expressions
    ov.offsetWidth;
    ov.classList.add('show');
    function close() {
      ov.classList.remove('show');
      document.removeEventListener('keydown', onKey);
      setTimeout(function () { if (ov.parentNode) ov.parentNode.removeChild(ov); }, 220);
      if (opts.onClose) opts.onClose();
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    $$('[data-close]', ov).forEach(function (b) { b.onclick = close; });
    return { el: ov, close: close };
  }
  function sheetHead(title) { return '<div class="sh-h"><h2>' + esc(title) + '</h2><button class="iconbtn" data-close aria-label="Schließen">' + icon('close') + '</button></div>'; }

  // ---------------------------------------------------------------- Login
  function showLogin() {
    $('#app').innerHTML = '<div class="login"><form class="card" id="lf"><h1>Familienwand</h1><p class="hint">Bitte gib das Familien-Passwort ein. Dieses Gerät bleibt danach angemeldet.</p>' +
      '<input class="input" id="pw" type="password" autocomplete="current-password" placeholder="Passwort" aria-label="Passwort">' +
      '<p class="err" id="lerr" hidden></p><button class="btn primary block" type="submit">Anmelden</button></form></div>';
    $('#pw').focus();
    $('#lf').onsubmit = function (e) {
      e.preventDefault();
      api('POST', '/api/login', { password: $('#pw').value }).then(function () { location.reload(); }, function (err) { var el = $('#lerr'); el.textContent = err.message; el.hidden = false; });
    };
  }

  // ================================================================ HANDY
  function renderMobile() {
    var t = today(), b = S.boot, r = range();
    var h = '<div class="m">';
    h += '<header class="m-top"><div><div class="m-fam">' + esc(b.settings.familyName || 'Familie') + '</div><div class="m-date">' + dateLong(new Date()) + '</div></div>' +
      '<div class="m-actions"><a class="iconbtn fl-link" href="/fluss" aria-label="Mein Tagesfluss">✨</a><button class="iconbtn" id="sync" aria-label="Jetzt synchronisieren">' + icon('sync') + '</button><button class="iconbtn" id="openSet" aria-label="Einstellungen">' + icon('gear') + '</button></div></header>';
    if (S.offline) h += '<div class="offline">Offline – du siehst den letzten Stand.</div>';

    // Tablet erkannt? (einmalig fragen)
    if (!store('fw.device') && isTablet()) {
      h += '<div class="card banner"><h3>Tablet erkannt</h3><p>Soll dieses Gerät die Family Wall anzeigen? Großer Wochenplan, Uhr und Wetter – ideal für die Wand.</p>' +
        '<div class="row"><button class="btn primary small" id="goWall">Ja, als Family Wall</button><button class="btn small" id="stayMobile">Nein, normale Ansicht</button></div></div>';
    }
    // Google noch nicht verbunden?
    if (!b.google.configured && !b.calendars.some(function (c) { return c.type !== 'local'; }) && !store('fw.hideGoogleHint')) {
      h += '<div class="card banner"><h3>Google Kalender verbinden</h3><p>Dann erscheinen eure Google-Termine hier und auf der Wand – und neue Termine landen direkt in Google.</p>' +
        '<div class="row"><button class="btn primary small" id="goGoogle">Jetzt einrichten</button><button class="btn small" id="hideGoogle">Später</button></div></div>';
    }
    // Fehler bei Kalendern
    b.calendars.forEach(function (c) {
      if (c.status && c.status.error) h += '<div class="card banner"><p><b>' + esc(c.name) + ':</b> ' + esc(c.status.error) + '</p></div>';
    });

    // Tagesleiste
    h += '<div class="strip" role="list">';
    for (var i = 0; i < 21; i++) {
      var d = addDays(t, i), evs = eventsOn(d).filter(matchesFilter), dots = '';
      evs.slice(0, 4).forEach(function (ev) { dots += '<i style="background:' + evColor(ev) + '"></i>'; });
      h += '<button class="day-b' + (i === 0 ? ' today' : '') + (d.getDay() === 0 || d.getDay() === 6 ? ' we' : '') + '" data-jump="' + ymd(d) + '" role="listitem"><span class="wd">' + WD_SHORT[d.getDay()] + '</span><span class="dn">' + d.getDate() + '</span><span class="dots">' + dots + '</span></button>';
    }
    h += '</div>';

    // Personenfilter
    h += '<div class="chips scroll" role="group" aria-label="Filter"><button class="chip" data-filter="all" aria-pressed="' + (S.filter === 'all') + '">Alle</button>';
    b.people.forEach(function (p) { h += '<button class="chip" data-filter="' + esc(p.id) + '" aria-pressed="' + (S.filter === p.id) + '"><span class="em">' + esc(p.emoji) + '</span>' + esc(p.name) + '</button>'; });
    h += '</div>';

    // Liste
    var now = new Date();
    for (var k = 0; k <= Math.round((r.to - t) / 86400000); k++) {
      var day = addDays(t, k), list = eventsOn(day).filter(matchesFilter);
      if (!list.length && k > 1) continue;
      h += '<section class="group" id="d-' + ymd(day) + '"><div class="g-h"><b>' + dayLabel(day) + '</b><span>' + (k < 2 ? WD_LONG[day.getDay()] + ', ' + day.getDate() + '. ' + MON_SHORT[day.getMonth()] : '') + '</span><button class="add" data-add="' + ymd(day) + '">＋ Termin</button></div>';
      if (!list.length) h += '<div class="empty">' + (k === 0 ? 'Heute steht nichts an. Ein freier Tag 🌿' : 'Noch nichts geplant.') + '</div>';
      list.forEach(function (ev) { h += evRow(ev, day, now); });
      h += '</section>';
    }
    h += '<p class="hint" style="text-align:center;margin-top:28px">Zeigt die nächsten ' + Math.round((r.to - t) / 86400000) + ' Tage.</p>';
    h += '</div><button class="fab" id="fab">' + icon('plus') + ' Termin</button>';
    $('#app').innerHTML = h;

    $('#fab').onclick = function () { openEditor(null, null); };
    $('#openSet').onclick = function () { openSettings(); };
    $('#sync').onclick = doSync;
    $$('[data-filter]').forEach(function (el) { el.onclick = function () { S.filter = el.getAttribute('data-filter'); render(); }; });
    $$('[data-add]').forEach(function (el) { el.onclick = function () { openEditor(null, el.getAttribute('data-add')); }; });
    $$('[data-jump]').forEach(function (el) {
      el.onclick = function () {
        var g = document.getElementById('d-' + el.getAttribute('data-jump'));
        if (g) g.scrollIntoView({ behavior: 'smooth', block: 'start' });
        else openEditor(null, el.getAttribute('data-jump'));
      };
    });
    bindEventClicks($('#app'));
    var gw = $('#goWall'); if (gw) gw.onclick = function () { store('fw.device', 'wall'); location.href = '/wall'; };
    var sm = $('#stayMobile'); if (sm) sm.onclick = function () { store('fw.device', 'mobile'); render(); };
    var gg = $('#goGoogle'); if (gg) gg.onclick = function () { openSettings('google'); };
    var hg = $('#hideGoogle'); if (hg) hg.onclick = function () { store('fw.hideGoogleHint', '1'); render(); };
  }

  function evRow(ev, day, now) {
    var k = evKind(ev), s = evStart(ev), e = evEnd(ev);
    var past = !ev.allDay && e < now;
    if (k === 'waste' || k === 'holiday') {
      return '<button class="ev special" data-ev="' + esc(ev.calendarId + '|' + ev.id) + '">' + avatars(ev) + '<span class="tx"><span class="tt">' + esc(ev.title) + '</span></span></button>';
    }
    var tm;
    if (ev.allDay) {
      var last = addDays(e, -1);
      tm = '<small>ganztägig</small>';
      if (ymd(last) !== ymd(s)) tm = '<small>bis</small>' + last.getDate() + '.' + (last.getMonth() + 1) + '.';
    } else {
      var startsToday = ymd(s) === ymd(day);
      tm = (startsToday ? hm(s) : '…') + '<small>' + (ymd(e) === ymd(day) ? 'bis ' + hm(e) : 'mehrtägig') + '</small>';
    }
    var cal = calendar(ev.calendarId);
    var meta = [];
    if (ev.location) meta.push('📍 ' + esc(ev.location));
    if (cal && S.boot.calendars.length > 1) meta.push(esc(cal.name));
    return '<button class="ev' + (past ? ' past' : '') + '" data-ev="' + esc(ev.calendarId + '|' + ev.id) + '" style="background:' + tint(evColor(ev)) + ';border-color:' + hexRgba(evColor(ev), 0.35) + '">' +
      '<span class="tm">' + tm + '</span><span class="tx"><span class="tt">' + esc(ev.title) + '</span>' + (meta.length ? '<span class="mt">' + meta.join(' · ') + '</span>' : '') + '</span>' + avatars(ev) + '</button>';
  }

  function bindEventClicks(root) {
    $$('[data-ev]', root).forEach(function (el) {
      el.onclick = function (e) {
        e.stopPropagation();
        var key = el.getAttribute('data-ev'), i = key.indexOf('|');
        var ev = findEvent(key.slice(0, i), key.slice(i + 1));
        if (ev) openDetail(ev);
      };
    });
  }
  function findEvent(calId, id) {
    for (var i = 0; i < S.events.length; i++) if (S.events[i].calendarId === calId && S.events[i].id === id) return S.events[i];
    return null;
  }

  function doSync() {
    var b = $('#sync'); if (b) b.classList.add('spin');
    api('POST', '/api/sync').then(function (bb) { S.boot = bb; return loadEvents(); })
      .then(function () { toast('Alles aktuell ✓'); }, function (e) { toast(e.message); })
      .then(function () { var x = $('#sync'); if (x) x.classList.remove('spin'); });
  }

  function isTablet() {
    var m = Math.min(screen.width, screen.height);
    return m >= 600 && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }

  // ---------------------------------------------------------------- Termin-Details
  function whenText(ev) {
    var s = evStart(ev), e = evEnd(ev);
    if (ev.allDay) {
      var last = addDays(e, -1);
      return ymd(last) === ymd(s) ? dateLong(s) + ' · ganztägig' : dateLong(s) + ' – ' + dateLong(last);
    }
    return dateLong(s) + '<br>' + hm(s) + ' – ' + (ymd(e) === ymd(s) ? hm(e) : dateLong(e) + ' ' + hm(e)) + ' Uhr';
  }
  function openDetail(ev) {
    var cal = calendar(ev.calendarId), ps = evPeople(ev);
    var html = sheetHead(ev.title) + '<div class="sh-b"><div class="detail-when">' + whenText(ev) + '</div>' +
      '<div class="kv"><span class="k">Wer</span><span>' + (ps.length ? ps.map(function (p) { return esc(p.emoji + ' ' + p.name); }).join(', ') : '👨‍👩‍👧 ganze Familie') + '</span></div>' +
      (ev.location ? '<div class="kv"><span class="k">Ort</span><span>' + esc(ev.location) + '</span></div>' : '') +
      (ev.notes ? '<div class="kv"><span class="k">Notiz</span><span style="white-space:pre-wrap">' + esc(ev.notes) + '</span></div>' : '') +
      '<div class="kv"><span class="k">Kalender</span><span>' + esc(cal ? cal.name : '?') + (ev.editable ? '' : ' (nur lesbar)') + '</span></div>' +
      (ev.recurring ? '<p class="hint">Wiederkehrender Termin – Änderungen gelten nur für diesen einen Termin.</p>' : '') +
      '</div>' + (ev.editable ? '<div class="sh-f"><button class="btn" id="dDel">Löschen</button><button class="btn primary" id="dEdit">Bearbeiten</button></div>' : '');
    var sh = openSheet(html);
    if (!ev.editable) return;
    $('#dEdit', sh.el).onclick = function () { sh.close(); openEditor(ev, null); };
    var del = $('#dDel', sh.el);
    del.onclick = function () {
      if (del.getAttribute('data-sure')) return removeEvent(ev, sh);
      del.setAttribute('data-sure', '1');
      del.className = 'btn danger';
      del.textContent = 'Wirklich löschen?';
    };
  }

  function eventToBody(ev) {
    var b = { calendarId: ev.calendarId, title: ev.title, location: ev.location || '', notes: ev.notes || '', people: ev.people || [], allDay: ev.allDay };
    if (ev.allDay) { b.date = ev.start; b.endDate = ymd(addDays(parseYmd(ev.end), -1)); }
    else { var s = new Date(ev.start), e = new Date(ev.end); b.start = ymd(s) + 'T' + hm(s); b.end = ymd(e) + 'T' + hm(e); }
    return b;
  }
  function removeEvent(ev, sh) {
    api('DELETE', '/api/events/' + encodeURIComponent(ev.calendarId) + '/' + encodeURIComponent(ev.id)).then(function () {
      sh.close();
      S.events = S.events.filter(function (x) { return x !== ev; });
      render();
      vibrate(20);
      // „Rückgängig“ wie bei Kinboard: Termin wird genau so neu angelegt
      toast('„' + ev.title + '“ gelöscht', 'Rückgängig', function () {
        api('POST', '/api/events', eventToBody(ev)).then(function () { toast('Wiederhergestellt ✓'); loadEvents(); }, function (e) { toast(e.message); });
      });
    }, function (e) { toast(e.message); });
  }

  // ---------------------------------------------------------------- Termin anlegen / bearbeiten
  var DUR = [[30, '30 Min'], [60, '1 Std'], [90, '1½ Std'], [120, '2 Std'], [180, '3 Std']];
  var TIMES = ['08:00', '10:00', '12:00', '15:00', '17:00', '19:00'];

  function openEditor(ev, presetDate) {
    if (!writableCalendars().length) { toast('Kein beschreibbarer Kalender – lege in den Einstellungen einen an.'); return; }
    var editing = !!ev;
    var f;
    if (editing) {
      var s = evStart(ev), e = evEnd(ev);
      f = { title: ev.title, date: ymd(s), endDate: ev.allDay ? ymd(addDays(e, -1)) : ymd(s), allDay: ev.allDay, time: ev.allDay ? '15:00' : hm(s),
        dur: ev.allDay ? 60 : Math.max(5, Math.round((e - s) / 60000)), people: (ev.people || []).slice(), calendarId: ev.calendarId,
        location: ev.location || '', notes: ev.notes || '' };
    } else {
      var dc = defaultCalendar();
      f = { title: '', date: presetDate || ymd(today()), endDate: null, allDay: false, time: nextHalfHour(presetDate), dur: 60, people: [],
        calendarId: dc ? dc.id : null, location: '', notes: '' };
    }
    var touched = { date: !!presetDate, time: false, people: false, cal: editing, dur: false };

    var html = sheetHead(editing ? 'Termin bearbeiten' : 'Neuer Termin') +
      '<form class="sh-b" id="qf" autocomplete="off">' +
      '<div class="field"><input class="input qa-input" id="qTitle" placeholder="z. B. Zahnarzt Mi 15 Uhr" aria-label="Was?" value="' + esc(f.title) + '">' +
      (editing ? '' : '<div class="parsed" id="qParsed"><span class="hint" style="border:0;background:none;padding:0">Tipp: Datum und Uhrzeit einfach mitschreiben.</span></div>') + '</div>' +
      '<div class="field"><span class="label">Für wen?</span><div class="chips" id="qWho"></div></div>' +
      '<div class="field"><span class="label">Wann?</span><div class="chips" id="qDate"></div></div>' +
      '<div class="field"><span class="label">Uhrzeit</span><div class="chips" id="qTime"></div></div>' +
      '<div class="field" id="qDurF"><span class="label">Dauer</span><div class="chips" id="qDur"></div></div>' +
      '<div class="field" id="qEndF" hidden><span class="label">Mehrere Tage?</span><div class="chips"><label class="chip">bis&nbsp;<input type="date" id="qEnd"></label><button type="button" class="chip" id="qEndClear">nur ein Tag</button></div></div>' +
      '<details class="more"' + (f.location || f.notes ? ' open' : '') + '><summary>＋ Ort &amp; Notiz</summary>' +
      '<div class="field"><span class="label">Ort</span><input class="input" id="qLoc" value="' + esc(f.location) + '" placeholder="z. B. Praxis Dr. Meier"></div>' +
      '<div class="field"><span class="label">Notiz</span><textarea class="input" id="qNotes" placeholder="Was mitbringen? …">' + esc(f.notes) + '</textarea></div></details>' +
      '<div class="where" id="qWhere"></div><p class="err" id="qErr" hidden></p>' +
      '</form><div class="sh-f"><button class="btn primary" id="qSave" type="button">Speichern</button></div>';
    var sh = openSheet(html);
    var root = sh.el;

    function setDate(d) { f.date = d; if (f.endDate && f.endDate < d) f.endDate = null; }
    function draw() {
      // Wer
      var who = '<button type="button" class="chip" data-p="" aria-pressed="' + (f.people.length === 0) + '"><span class="em">👨‍👩‍👧</span>Alle</button>';
      S.boot.people.forEach(function (p) { who += '<button type="button" class="chip" data-p="' + esc(p.id) + '" aria-pressed="' + (f.people.indexOf(p.id) >= 0) + '"><span class="em">' + esc(p.emoji) + '</span>' + esc(p.name) + '</button>'; });
      $('#qWho', root).innerHTML = who;
      // Datum
      var t = today(), dh = '';
      for (var i = 0; i < 7; i++) {
        var d = addDays(t, i), y = ymd(d);
        dh += '<button type="button" class="chip" data-d="' + y + '" aria-pressed="' + (f.date === y) + '">' + (i === 0 ? 'Heute' : i === 1 ? 'Morgen' : WD_SHORT[d.getDay()] + ' ' + d.getDate() + '.') + '</button>';
      }
      var inStrip = false;
      for (i = 0; i < 7; i++) if (ymd(addDays(t, i)) === f.date) inStrip = true;
      dh += '<label class="chip" aria-pressed="' + !inStrip + '">📅&nbsp;<input type="date" id="qDatePick" value="' + f.date + '" aria-label="Datum wählen"></label>';
      $('#qDate', root).innerHTML = dh;
      // Zeit
      var th = '<button type="button" class="chip" data-t="all" aria-pressed="' + f.allDay + '">Ganztägig</button>';
      var known = TIMES.indexOf(f.time) >= 0;
      TIMES.forEach(function (x) { th += '<button type="button" class="chip" data-t="' + x + '" aria-pressed="' + (!f.allDay && f.time === x) + '">' + x + '</button>'; });
      th += '<label class="chip" aria-pressed="' + (!f.allDay && !known) + '">🕒&nbsp;<input type="time" id="qTimePick" value="' + f.time + '" aria-label="Uhrzeit wählen"></label>';
      $('#qTime', root).innerHTML = th;
      // Dauer
      var du = '';
      var knownD = false;
      DUR.forEach(function (x) { if (x[0] === f.dur) knownD = true; du += '<button type="button" class="chip" data-du="' + x[0] + '" aria-pressed="' + (f.dur === x[0]) + '">' + x[1] + '</button>'; });
      if (!knownD) du += '<span class="chip" aria-pressed="true">' + fmtDur(f.dur) + '</span>';
      $('#qDur', root).innerHTML = du;
      $('#qDurF', root).hidden = f.allDay;
      $('#qEndF', root).hidden = !f.allDay;
      $('#qEnd', root).value = f.endDate || '';
      $('#qEnd', root).min = f.date;
      // Kalender
      var cals = writableCalendars(), cal = calendar(f.calendarId);
      var wh = 'Wird gespeichert in: <b>' + esc(cal ? cal.name : '–') + '</b>' + (cal && cal.type === 'google' ? ' (Google)' : '');
      if (cals.length > 1) {
        wh += ' <select id="qCal" aria-label="Kalender">' + cals.map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === f.calendarId ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('') + '</select>';
      }
      if (!f.allDay) wh += '<br><span>' + dayLabel(parseYmd(f.date)) + ', ' + f.time + ' – ' + endTimeText() + ' Uhr</span>';
      $('#qWhere', root).innerHTML = wh;
      bind();
    }
    function endTimeText() { var s = startDate(); var e = new Date(s.getTime() + f.dur * 60000); return hm(e) + (ymd(e) !== ymd(s) ? ' (+1 Tag)' : ''); }
    function startDate() { var d = parseYmd(f.date), p = f.time.split(':'); d.setHours(+p[0], +p[1], 0, 0); return d; }
    function autoCalendar() {
      if (touched.cal) return;
      if (f.people.length === 1) {
        var own = writableCalendars().filter(function (c) { return c.personId === f.people[0]; });
        if (own.length) { f.calendarId = own[0].id; return; }
      }
      var dc = defaultCalendar(); if (dc) f.calendarId = dc.id;
    }
    function bind() {
      $$('[data-p]', root).forEach(function (b) {
        b.onclick = function () {
          var id = b.getAttribute('data-p');
          touched.people = true;
          if (!id) f.people = [];
          else if (f.people.indexOf(id) >= 0) f.people.splice(f.people.indexOf(id), 1);
          else f.people.push(id);
          autoCalendar(); draw(); vibrate(8);
        };
      });
      $$('[data-d]', root).forEach(function (b) { b.onclick = function () { touched.date = true; setDate(b.getAttribute('data-d')); draw(); vibrate(8); }; });
      $('#qDatePick', root).onchange = function () { if (this.value) { touched.date = true; setDate(this.value); draw(); } };
      $$('[data-t]', root).forEach(function (b) {
        b.onclick = function () {
          var v = b.getAttribute('data-t'); touched.time = true;
          if (v === 'all') f.allDay = !f.allDay; else { f.allDay = false; f.time = v; }
          draw(); vibrate(8);
        };
      });
      $('#qTimePick', root).onchange = function () { if (this.value) { touched.time = true; f.allDay = false; f.time = this.value; draw(); } };
      $$('[data-du]', root).forEach(function (b) { b.onclick = function () { touched.dur = true; f.dur = +b.getAttribute('data-du'); draw(); vibrate(8); }; });
      $('#qEnd', root).onchange = function () { f.endDate = this.value && this.value > f.date ? this.value : null; draw(); };
      $('#qEndClear', root).onclick = function () { f.endDate = null; draw(); };
      var qc = $('#qCal', root); if (qc) qc.onchange = function () { touched.cal = true; f.calendarId = this.value; draw(); };
    }

    // Schnell-Eingabe: Text verstehen (nur bei neuen Terminen)
    var titleEl = $('#qTitle', root);
    if (!editing) {
      titleEl.oninput = function () {
        var r = window.FWParse.parse(titleEl.value, new Date());
        f.title = r.title;
        var chips = [];
        if (r.date && (!touched.date || !r.dateGuessed)) { setDate(r.date); chips.push('📅 ' + dayLabel(parseYmd(r.date))); }
        if (r.endDate) { f.endDate = r.endDate; chips.push('bis ' + dayLabel(parseYmd(r.endDate))); }
        if (r.time) { f.time = r.time; f.allDay = false; chips.push('🕒 ' + r.time); }
        else if (r.allDay && !touched.time) { f.allDay = true; chips.push('ganztägig'); }
        if (r.durationMin) { f.dur = r.durationMin; chips.push('⏱ ' + fmtDur(r.durationMin)); }
        if (r.people.length) {
          var ids = [];
          r.people.forEach(function (n) {
            S.boot.people.forEach(function (p) { if (p.name.toLowerCase().indexOf(n.toLowerCase()) === 0 && ids.indexOf(p.id) < 0) ids.push(p.id); });
          });
          if (ids.length) { f.people = ids; autoCalendar(); chips.push(ids.map(function (id) { return person(id).emoji; }).join('')); }
        }
        $('#qParsed', root).innerHTML = chips.length ? chips.map(function (c) { return '<span>' + esc(c) + '</span>'; }).join('') : '';
        draw();
      };
    } else titleEl.oninput = function () { f.title = titleEl.value.trim(); };

    function save() {
      var err = $('#qErr', root);
      f.location = $('#qLoc', root).value.trim();
      f.notes = $('#qNotes', root).value.trim();
      if (!f.title) { err.textContent = 'Bitte schreib kurz, worum es geht.'; err.hidden = false; titleEl.focus(); return; }
      var body = { calendarId: f.calendarId, title: f.title, allDay: f.allDay, people: f.people, location: f.location, notes: f.notes };
      if (f.allDay) { body.date = f.date; body.endDate = f.endDate || f.date; }
      else { var s = startDate(), e = new Date(s.getTime() + f.dur * 60000); body.start = ymd(s) + 'T' + hm(s); body.end = ymd(e) + 'T' + hm(e); }
      var btn = $('#qSave', root); btn.disabled = true; btn.textContent = 'Speichert …';
      var req = editing ? api('PATCH', '/api/events/' + encodeURIComponent(ev.calendarId) + '/' + encodeURIComponent(ev.id), body) : api('POST', '/api/events', body);
      req.then(function () {
        sh.close(); vibrate([15, 40, 15]);
        toast(editing ? 'Gespeichert ✓' : 'Eingetragen ✓ – steht jetzt auch auf der Wand');
        loadEvents();
      }, function (e) { btn.disabled = false; btn.textContent = 'Speichern'; err.textContent = e.message; err.hidden = false; });
    }
    $('#qSave', root).onclick = save;
    $('#qf', root).onsubmit = function (e) { e.preventDefault(); save(); };
    titleEl.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); save(); } };
    draw();
    if (!editing) setTimeout(function () { titleEl.focus(); }, 250);
  }
  function nextHalfHour(preset) {
    if (preset && preset !== ymd(today())) return '15:00';
    var n = new Date(); var m = n.getHours() * 60 + n.getMinutes() + 30; m = Math.ceil(m / 30) * 30;
    if (m >= 23 * 60) return '19:00';
    return pad(Math.floor(m / 60)) + ':' + pad(m % 60);
  }
  function fmtDur(m) { if (m < 60) return m + ' Min'; var h = Math.floor(m / 60), r = m % 60; return h + ' Std' + (r ? ' ' + r : ''); }

  // ---------------------------------------------------------------- Einstellungen
  function openSettings(focus) {
    var sh = openSheet(sheetHead('Einstellungen') + '<div class="sh-b" id="setB"></div>', { full: true, onClose: function () { loadAll().catch(function () { /* egal */ }); } });
    var root = $('#setB', sh.el);
    var addType = 'google';

    function draw() {
      var b = S.boot, st = b.settings, ntfy = st.ntfy || { enabled: false, server: 'https://ntfy.sh', topic: '', minutesBefore: 30, morningAt: '07:00' };
      var h = '';
      // Familie
      h += '<section class="set-sec"><h3>Familie</h3><div class="field"><span class="label">Name auf der Wand</span><input class="input" id="sFam" value="' + esc(st.familyName) + '"></div>';
      b.people.forEach(function (p, i) {
        h += '<div class="card row-p" data-pi="' + i + '"><input class="input emoji" value="' + esc(p.emoji) + '" aria-label="Emoji" data-k="emoji"><input class="input name" value="' + esc(p.name) + '" aria-label="Name" data-k="name">' +
          '<div class="sw">' + PALETTE.map(function (c) { return '<button type="button" style="background:' + c + '" data-c="' + c + '" aria-label="Farbe ' + c + '" aria-pressed="' + (p.color === c) + '"></button>'; }).join('') + '</div>' +
          '<button class="btn small" data-rm="' + i + '">Entfernen</button></div>';
      });
      h += '<div class="row-p"><button class="btn small" id="sAddP">＋ Person</button><button class="btn primary small" id="sSaveP">Familie speichern</button></div></section>';

      // Kalender
      h += '<section class="set-sec"><h3>Kalender</h3>';
      b.calendars.forEach(function (c) {
        var stt = c.status || {};
        var line = c.type === 'local' ? 'nur in der Familienwand · ' + stt.count + ' Termine'
          : stt.error ? '⚠️ ' + esc(stt.error) : stt.syncedAt ? '✓ synchronisiert ' + since(stt.syncedAt) + ' · ' + stt.count + ' Termine' : 'wird synchronisiert …';
        h += '<div class="card cal" data-cal="' + esc(c.id) + '"><div class="top"><span class="dot" style="background:' + calColor(c) + '"></span><span class="nm">' + esc(c.name) + '</span><span class="tp">' + ({ google: 'Google', ics: 'iCal-Abo', local: 'Lokal' })[c.type] + (c.writable ? '' : ' · nur lesen') + '</span></div>' +
          '<p class="hint">' + line + '</p><div class="opts"><label>Gehört <select data-f="personId"><option value="">ganzer Familie</option>' +
          b.people.map(function (p) { return '<option value="' + esc(p.id) + '"' + (c.personId === p.id ? ' selected' : '') + '>' + esc(p.emoji + ' ' + p.name) + '</option>'; }).join('') + '</select></label>' +
          '<label>Art <select data-f="kind"><option value="normal">Termine</option><option value="holiday"' + (c.kind === 'holiday' ? ' selected' : '') + '>Feiertage/Ferien</option><option value="waste"' + (c.kind === 'waste' ? ' selected' : '') + '>Müllabfuhr</option></select></label>' +
          (c.writable && c.kind !== 'waste' ? '<label class="switch"><input type="radio" name="defcal" data-f="isDefault"' + (c.isDefault ? ' checked' : '') + '> Standard für neue Termine</label>' : '') +
          '<button class="btn small" data-calrm>Entfernen</button></div></div>';
      });
      h += '<div class="card set-sec"><span class="label">Kalender hinzufügen</span><div class="seg" role="group">' +
        [['google', 'Google'], ['ics', 'iCal-Link'], ['local', 'Nur lokal']].map(function (x) { return '<button type="button" data-at="' + x[0] + '" aria-pressed="' + (addType === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div>';
      if (addType === 'google') {
        h += b.google.configured
          ? '<div class="field"><span class="label">Kalender-ID</span><input class="input" id="aId" placeholder="z. B. eure.adresse@gmail.com oder …@group.calendar.google.com"></div>' +
            '<p class="hint">Zu finden in Google Kalender → Einstellungen → Kalender auswählen → „Kalender integrieren“ → Kalender-ID. Vorher den Kalender mit <b>' + esc(b.google.email) + '</b> teilen.</p>'
          : '<p class="hint">Verbinde zuerst Google (Abschnitt unten).</p>';
      } else if (addType === 'ics') {
        h += '<div class="field"><span class="label">iCal-Link</span><input class="input" id="aUrl" placeholder="https://… oder webcal://…"></div><p class="hint">Für Kita, Schule, Verein, Müllabfuhr oder Feiertage. Wird nur gelesen.</p>';
      } else {
        h += '<p class="hint">Ein Kalender nur in der Familienwand – ohne Google. Gut zum Ausprobieren.</p>';
      }
      if (addType !== 'google' || b.google.configured) {
        h += '<div class="field"><span class="label">Name (optional)</span><input class="input" id="aName" placeholder="z. B. Familie, Kita, Papa"></div>' +
          '<div class="opts row-p"><label>Gehört <select id="aPerson"><option value="">ganzer Familie</option>' + b.people.map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.emoji + ' ' + p.name) + '</option>'; }).join('') + '</select></label>' +
          '<label>Art <select id="aKind"><option value="normal">Termine</option><option value="holiday">Feiertage/Ferien</option><option value="waste">Müllabfuhr</option></select></label></div>' +
          '<p class="err" id="aErr" hidden></p><button class="btn primary" id="aAdd">Prüfen &amp; hinzufügen</button>';
      }
      h += '</div></section>';

      // Google
      h += '<section class="set-sec" id="sec-google"><h3>Google verbinden</h3>';
      if (b.google.configured) {
        h += '<div class="card set-sec"><p class="ok">✓ Verbunden über das Dienstkonto</p><code id="saMail">' + esc(b.google.email) + '</code>' +
          '<div class="row-p"><button class="btn small" id="cpMail">E-Mail kopieren</button><button class="btn small" id="gRm">Verbindung entfernen</button></div>' +
          '<p class="hint">Teile jeden Google-Kalender mit dieser Adresse: Google Kalender → ⋮ beim Kalender → „Einstellungen und Freigabe“ → „Für bestimmte Personen freigeben“ → Adresse einfügen → <b>„Änderungen an Terminen vornehmen“</b>. Dann oben die Kalender-ID eintragen.</p></div>';
      } else {
        h += '<div class="card set-sec"><ol class="steps">' +
          '<li>Öffne <b>console.cloud.google.com</b> und lege ein Projekt an (z. B. „Familienwand“).</li>' +
          '<li>Unter „APIs &amp; Dienste“ → „Bibliothek“ die <b>Google Calendar API</b> aktivieren.</li>' +
          '<li>„IAM &amp; Verwaltung“ → „Dienstkonten“ → <b>Dienstkonto erstellen</b> (Name egal, keine Rollen nötig).</li>' +
          '<li>Beim Dienstkonto → „Schlüssel“ → „Schlüssel hinzufügen“ → <b>JSON</b>. Die Datei wird heruntergeladen.</li>' +
          '<li>Diese Datei hier hochladen:</li></ol>' +
          '<input type="file" id="gKey" accept="application/json,.json" class="input"><p class="err" id="gErr" hidden></p>' +
          '<p class="hint">Der Schlüssel bleibt auf eurem NAS (im Ordner <code>data</code>). Kein Google-Login-Fenster, kein Ablauf nach 7 Tagen.</p></div>';
      }
      h += '</section>';

      // Erinnerungen
      h += '<section class="set-sec"><h3>Erinnerungen aufs Handy</h3><div class="card set-sec">' +
        '<p class="hint">Über die kostenlose App <b>ntfy</b> (Android &amp; iPhone). In der App das gleiche Thema abonnieren – fertig.</p>' +
        '<label class="switch"><input type="checkbox" id="nOn"' + (ntfy.enabled ? ' checked' : '') + '> Erinnerungen senden</label>' +
        '<div class="field"><span class="label">Thema (wie ein geheimer Kanalname)</span><input class="input" id="nTopic" value="' + esc(ntfy.topic || suggestTopic()) + '"></div>' +
        '<div class="row-p"><label>Erinnern <select id="nMin">' + [10, 15, 30, 60, 120].map(function (m) { return '<option value="' + m + '"' + (ntfy.minutesBefore === m ? ' selected' : '') + '>' + fmtDur(m) + ' vorher</option>'; }).join('') + '</select></label>' +
        '<label>Morgen-Übersicht um <input type="time" id="nMorning" class="input" style="width:auto;min-height:0;padding:6px 8px" value="' + esc(ntfy.morningAt || '') + '"></label></div>' +
        '<div class="field"><span class="label">ntfy-Server</span><input class="input" id="nServer" value="' + esc(ntfy.server || 'https://ntfy.sh') + '"></div>' +
        '<p class="hint">Personen können ein eigenes Thema bekommen (siehe README) – dann gehen ihre Termine nur an sie.</p>' +
        '<div class="row-p"><button class="btn primary small" id="nSave">Speichern</button><button class="btn small" id="nTest">Test senden</button></div></div></section>';

      // Wand
      h += '<section class="set-sec"><h3>Family Wall</h3><div class="card set-sec">' +
        '<p class="hint">Auf dem Tablet einfach <code>' + esc(location.origin) + '/wall</code> öffnen und „Zum Startbildschirm hinzufügen“.</p>' +
        '<div class="row-p"><button class="btn primary small" id="wGo">Dieses Gerät als Family Wall</button>' + (store('fw.device') ? '<button class="btn small" id="wReset">Gerätewahl zurücksetzen</button>' : '') + '</div>' +
        '<div class="field"><span class="label">Wetter-Ort</span><div class="row-p"><input class="input name" id="wPlace" placeholder="z. B. Hamburg" value="' + esc(st.weather ? st.weather.name : '') + '"><button class="btn small" id="wFind">Suchen</button></div><div class="chips" id="wRes"></div></div>' +
        '<div class="row-p"><label>Nachtmodus von <input type="time" id="wNf" class="input" style="width:auto;min-height:0;padding:6px 8px" value="' + esc(st.nightFrom || '') + '"></label><label>bis <input type="time" id="wNt" class="input" style="width:auto;min-height:0;padding:6px 8px" value="' + esc(st.nightTo || '') + '"></label></label></div>' +
        '<label class="switch"><input type="checkbox" id="wMon"' + (st.weekStart === 'monday' ? ' checked' : '') + '> Woche am Montag beginnen (statt ab heute)</label>' +
        '<button class="btn small" id="wSave">Wand-Einstellungen speichern</button></div></section>';

      // App installieren
      h += '<section class="set-sec"><h3>Als App aufs Handy</h3><div class="card set-sec"><ol class="steps">' +
        '<li><b>iPhone:</b> In Safari öffnen → Teilen-Symbol → „Zum Home-Bildschirm“.</li>' +
        '<li><b>Android:</b> In Chrome öffnen → ⋮ → „App installieren“ bzw. „Zum Startbildschirm hinzufügen“.</li></ol>' +
        (location.protocol !== 'https:' && location.hostname !== 'localhost' ? '<p class="hint">Tipp: Über <b>https</b> (z. B. mit Tailscale) wird es eine vollwertige App mit Offline-Modus. Siehe README.</p>' : '') + '</div></section>';

      h += '<section class="set-sec"><p class="hint">Familienwand ' + esc(b.version) + '</p>' + (b.authRequired ? '<button class="btn small" id="logout">Abmelden</button>' : '<p class="hint">⚠️ Kein Passwort gesetzt – nur im Heimnetz nutzen oder <code>APP_PASSWORD</code> setzen.</p>') + '</section>';
      root.innerHTML = h;
      bind();
    }

    function bind() {
      var b = S.boot;
      // Familie
      $$('[data-pi]', root).forEach(function (row) {
        var i = +row.getAttribute('data-pi');
        $$('input', row).forEach(function (inp) { inp.oninput = function () { b.people[i][inp.getAttribute('data-k')] = inp.value; }; });
        $$('[data-c]', row).forEach(function (btn) { btn.onclick = function () { b.people[i].color = btn.getAttribute('data-c'); draw(); }; });
      });
      $$('[data-rm]', root).forEach(function (btn) { btn.onclick = function () { b.people.splice(+btn.getAttribute('data-rm'), 1); draw(); }; });
      $('#sAddP', root).onclick = function () { b.people.push({ name: '', emoji: '🙂', color: PALETTE[b.people.length % PALETTE.length] }); draw(); var ins = $$('.input.name', root); ins[ins.length - 1].focus(); };
      $('#sSaveP', root).onclick = function () {
        api('PUT', '/api/people', { people: b.people.filter(function (p) { return String(p.name).trim(); }) })
          .then(function (bb) { return api('PUT', '/api/settings', { familyName: $('#sFam', root).value }).then(function (b2) { S.boot = b2; draw(); toast('Familie gespeichert ✓'); }); }, function (e) { toast(e.message); });
      };
      // Kalender
      $$('[data-cal]', root).forEach(function (card) {
        var id = card.getAttribute('data-cal');
        $$('[data-f]', card).forEach(function (inp) {
          inp.onchange = function () {
            var patch = {}; var k = inp.getAttribute('data-f');
            patch[k] = k === 'isDefault' ? true : inp.value || null;
            api('PATCH', '/api/calendars/' + encodeURIComponent(id), patch).then(function (bb) { S.boot = bb; draw(); toast('Gespeichert ✓'); }, function (e) { toast(e.message); });
          };
        });
        var rm = $('[data-calrm]', card);
        rm.onclick = function () {
          if (!rm.getAttribute('data-sure')) { rm.setAttribute('data-sure', '1'); rm.className = 'btn danger small'; rm.textContent = calendar(id).type === 'local' ? 'Mit allen Terminen löschen?' : 'Wirklich entfernen?'; return; }
          api('DELETE', '/api/calendars/' + encodeURIComponent(id)).then(function (bb) { S.boot = bb; draw(); toast('Kalender entfernt'); }, function (e) { toast(e.message); });
        };
      });
      $$('[data-at]', root).forEach(function (btn) { btn.onclick = function () { addType = btn.getAttribute('data-at'); draw(); }; });
      var add = $('#aAdd', root);
      if (add) add.onclick = function () {
        var err = $('#aErr', root); err.hidden = true;
        var body = { type: addType, name: $('#aName', root).value, personId: $('#aPerson', root).value || null, kind: $('#aKind', root).value };
        if (addType === 'google') body.googleId = $('#aId', root).value.trim();
        if (addType === 'ics') body.url = $('#aUrl', root).value.trim();
        add.disabled = true; add.textContent = 'Prüfe …';
        api('POST', '/api/calendars', body).then(function (bb) { S.boot = bb; draw(); toast('Kalender hinzugefügt ✓'); }, function (e) { add.disabled = false; add.textContent = 'Prüfen & hinzufügen'; err.textContent = e.message; err.hidden = false; });
      };
      // Google
      var key = $('#gKey', root);
      if (key) key.onchange = function () {
        var file = key.files[0]; if (!file) return;
        var rd = new FileReader();
        rd.onload = function () {
          var json; var err = $('#gErr', root);
          try { json = JSON.parse(rd.result); } catch (e) { err.textContent = 'Die Datei ist kein gültiges JSON.'; err.hidden = false; return; }
          api('POST', '/api/google/key', json).then(function (bb) { S.boot = bb; addType = 'google'; draw(); toast('Google verbunden ✓'); }, function (e) { err.textContent = e.message; err.hidden = false; });
        };
        rd.readAsText(file);
      };
      var cp = $('#cpMail', root);
      if (cp) cp.onclick = function () {
        var txt = b.google.email;
        var done = function () { toast('Kopiert ✓'); };
        if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(txt).then(done, function () { selectText($('#saMail', root)); });
        else { selectText($('#saMail', root)); try { document.execCommand('copy'); done(); } catch (e) { /* markiert */ } }
      };
      var grm = $('#gRm', root);
      if (grm) grm.onclick = function () {
        if (!grm.getAttribute('data-sure')) { grm.setAttribute('data-sure', '1'); grm.className = 'btn danger small'; grm.textContent = 'Wirklich trennen?'; return; }
        api('DELETE', '/api/google/key').then(function (bb) { S.boot = bb; draw(); });
      };
      // ntfy
      function ntfyBody() { return { ntfy: { enabled: $('#nOn', root).checked, topic: $('#nTopic', root).value, minutesBefore: +$('#nMin', root).value, morningAt: $('#nMorning', root).value, server: $('#nServer', root).value } }; }
      $('#nSave', root).onclick = function () { api('PUT', '/api/settings', ntfyBody()).then(function (bb) { S.boot = bb; draw(); toast('Erinnerungen gespeichert ✓'); }, function (e) { toast(e.message); }); };
      $('#nTest', root).onclick = function () {
        api('PUT', '/api/settings', ntfyBody()).then(function (bb) { S.boot = bb; return api('POST', '/api/ntfy/test'); }).then(function () { toast('Test gesendet – schau aufs Handy'); }, function (e) { toast(e.message); });
      };
      // Wand
      $('#wGo', root).onclick = function () { store('fw.device', 'wall'); location.href = '/wall'; };
      var wr = $('#wReset', root); if (wr) wr.onclick = function () { store('fw.device', null); toast('Zurückgesetzt'); draw(); };
      var picked = b.settings.weather;
      $('#wFind', root).onclick = function () {
        api('GET', '/api/geocode?q=' + encodeURIComponent($('#wPlace', root).value)).then(function (j) {
          var box = $('#wRes', root);
          if (!j.results.length) { box.innerHTML = '<span class="hint">Nichts gefunden.</span>'; return; }
          box.innerHTML = j.results.map(function (r, i) { return '<button type="button" class="chip" data-wr="' + i + '">' + esc(r.name) + ' <small>&nbsp;' + esc(r.region) + '</small></button>'; }).join('');
          $$('[data-wr]', box).forEach(function (btn) { btn.onclick = function () { picked = j.results[+btn.getAttribute('data-wr')]; $('#wPlace', root).value = picked.name; $$('[data-wr]', box).forEach(function (x) { x.setAttribute('aria-pressed', x === btn); }); }; });
        }, function (e) { toast(e.message); });
      };
      $('#wSave', root).onclick = function () {
        var placeVal = $('#wPlace', root).value.trim();
        api('PUT', '/api/settings', { weather: placeVal ? picked : null, nightFrom: $('#wNf', root).value, nightTo: $('#wNt', root).value, weekStart: $('#wMon', root).checked ? 'monday' : 'today' })
          .then(function (bb) { S.boot = bb; loadWeather(); draw(); toast('Gespeichert ✓'); }, function (e) { toast(e.message); });
      };
      var lo = $('#logout', root); if (lo) lo.onclick = function () { api('POST', '/api/logout').then(function () { location.reload(); }); };
    }
    draw();
    if (focus === 'google') setTimeout(function () { var g = $('#sec-google', root); if (g) g.scrollIntoView({ block: 'start' }); }, 300);
  }
  function since(iso) { var m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 1 ? 'gerade eben' : m < 60 ? 'vor ' + m + ' Min' : 'vor ' + Math.round(m / 60) + ' Std'; }
  function suggestTopic() { var a = 'abcdefghijkmnpqrstuvwxyz23456789', s = 'familie-'; for (var i = 0; i < 10; i++) s += a.charAt(Math.floor(Math.random() * a.length)); return s; }
  function selectText(el) { if (!el) return; var r = document.createRange(); r.selectNodeContents(el); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); }

  // ================================================================ FAMILY WALL
  var WEATHER = { 0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️', 45: '🌫️', 48: '🌫️', 51: '🌦️', 53: '🌦️', 55: '🌧️', 56: '🌧️', 57: '🌧️', 61: '🌦️', 63: '🌧️', 65: '🌧️', 66: '🌧️', 67: '🌧️', 71: '🌨️', 73: '🌨️', 75: '❄️', 77: '🌨️', 80: '🌦️', 81: '🌧️', 82: '⛈️', 85: '🌨️', 86: '❄️', 95: '⛈️', 96: '⛈️', 99: '⛈️' };
  function wIcon(code, isDay) { if (code === 0 && isDay === false) return '🌙'; return WEATHER[code] || '🌡️'; }

  function inNight() {
    var st = S.boot.settings;
    if (!st.nightFrom || !st.nightTo || Date.now() < S.nightWake) return false;
    var n = new Date(), m = n.getHours() * 60 + n.getMinutes();
    var f = st.nightFrom.split(':'), t = st.nightTo.split(':');
    var a = +f[0] * 60 + +f[1], b = +t[0] * 60 + +t[1];
    return a > b ? (m >= a || m < b) : (m >= a && m < b);
  }

  function renderWall() {
    var b = S.boot, now = new Date(), t = today();
    if (inNight()) {
      var nx = upcoming(now)[0];
      $('#app').innerHTML = '<div class="w-night" id="night"><div class="c">' + hm(now) + '</div><div class="d">' + dateLong(now) + '</div>' +
        (nx ? '<div class="n">Als Nächstes: ' + (nx.allDay ? '' : hm(evStart(nx)) + ' ') + esc(nx.title) + '</div>' : '') + '</div>';
      $('#night').onclick = function () { S.nightWake = Date.now() + 120000; render(); };
      return;
    }
    var start = b.settings.weekStart === 'monday' ? addDays(t, -((t.getDay() + 6) % 7)) : t;
    var h = '<div class="w" id="wall">';
    // Seite links
    h += '<aside class="w-side"><div class="w-head"><div class="w-clock" id="clock">' + hm(now) + '</div><div class="w-date">' + dateLong(now) + '</div></div>';
    if (S.weather) {
      var w = S.weather;
      h += '<div class="w-weather"><div class="now">' + wIcon(w.now.code, w.now.isDay) + '<b>' + w.now.temp + '°</b></div><div class="days">' +
        w.days.slice(1, 5).map(function (d) { var dd = parseYmd(d.date); return '<div>' + WD_SHORT[dd.getDay()] + '<b>' + wIcon(d.code) + '</b>' + d.max + '° / ' + d.min + '°</div>'; }).join('') + '</div></div>';
    } else h += '<div class="w-weather"></div>';
    h += '<div class="w-strip">' + todayStrip(now) + '</div>';
    // Heute
    var todays = eventsOn(t).filter(function (e) { return evKind(e) === 'normal'; });
    var nextMarked = false;
    h += '<section class="w-today"><h3>Heute</h3><div class="list">';
    if (!todays.length) h += '<div class="wt"><span></span><span class="n">Ein freier Tag 🌿</span><span></span></div>';
    todays.forEach(function (ev) {
      var s = evStart(ev), e = evEnd(ev), cls = '', inTxt = '';
      if (!ev.allDay) {
        if (e < now) cls = 'past';
        else if (s <= now) { cls = 'live'; inTxt = 'läuft bis ' + hm(e); }
        else if (!nextMarked) { cls = 'next'; nextMarked = true; inTxt = 'in ' + inText(s - now); }
      }
      h += '<div class="wt ' + cls + '" data-ev="' + esc(ev.calendarId + '|' + ev.id) + '"><span class="t">' + (ev.allDay ? '–' : hm(s)) + '</span><span class="n">' + esc(ev.title) + (inTxt ? '<span class="in">' + inTxt + '</span>' : '') + '</span><span>' + avatars(ev) + '</span></div>';
    });
    h += '</div></section></aside>';
    // Woche
    h += '<main class="w-week">';
    for (var i = 0; i < 7; i++) {
      var d = addDays(start, i), isT = ymd(d) === ymd(t);
      var list = eventsOn(d).filter(function (e) { return evKind(e) !== 'waste'; });
      h += '<button class="wday' + (isT ? ' today' : '') + (d.getDay() === 0 || d.getDay() === 6 ? ' we' : '') + '" data-day="' + ymd(d) + '"><div class="wday-h"><b>' + WD_SHORT[d.getDay()] + ' ' + d.getDate() + '.</b><span>' + (isT ? 'Heute' : (Math.round((d - t) / 86400000) === 1 ? 'Morgen' : MON_SHORT[d.getMonth()])) + '</span></div><div class="wday-list">';
      var max = 7, shown = 0;
      list.forEach(function (ev) {
        if (shown >= max) return;
        shown++;
        var s = evStart(ev), past = !ev.allDay && evEnd(ev) < now, k = evKind(ev);
        var col = evColor(ev);
        h += '<div class="wc' + (ev.allDay ? ' ad' : '') + (past ? ' past' : '') + (k === 'holiday' ? ' special' : '') + '" style="background:' + tint(col) + '">' +
          (ev.allDay ? '' : '<div class="ct">' + (ymd(s) === ymd(d) ? hm(s) : '…') + ' ' + miniAv(ev) + '</div>') +
          '<div class="cn">' + (ev.allDay ? miniAv(ev) + ' ' : '') + esc(ev.title) + '</div></div>';
      });
      if (list.length > max) h += '<div class="wday-more">+ ' + (list.length - max) + ' weitere</div>';
      h += '</div></button>';
    }
    h += '</main>';
    // Fußzeile
    h += '<footer class="w-foot"><div class="legend">' + b.people.map(function (p) { return '<span><i style="background:' + p.color + '"></i>' + esc(p.emoji + ' ' + p.name) + '</span>'; }).join('') +
      '<span><i style="background:' + FAMILY_COLOR + '"></i>👨‍👩‍👧 Alle</span></div><div class="acts"><span>' + (S.offline ? 'offline · ' : '') + 'Stand ' + hm(now) + '</span>' +
      '<button class="w-add" id="wAdd">＋ Termin</button><button class="w-menu" id="wMenu" aria-label="Menü">' + icon('menu') + '</button></div></footer></div>';
    $('#app').innerHTML = h;

    $('#wAdd').onclick = function () { openEditor(null, null); };
    $('#wMenu').onclick = wallMenu;
    $$('[data-day]').forEach(function (el) { el.onclick = function () { openDay(parseYmd(el.getAttribute('data-day'))); }; });
    bindEventClicks($('.w-today'));
    burnShift();
  }
  function miniAv(ev) { var k = evKind(ev); if (k === 'holiday') return '🎉'; var ps = evPeople(ev); return ps.length ? ps.map(function (p) { return esc(p.emoji); }).join('') : ''; }
  function inText(ms) { var m = Math.round(ms / 60000); if (m < 60) return m + ' Min'; var h = Math.floor(m / 60), r = m % 60; return h + ' Std' + (r ? ' ' + r + ' Min' : ''); }
  function upcoming(now) { return S.events.filter(function (e) { return evKind(e) === 'normal' && evStart(e) > now; }); }
  function todayStrip(now) {
    var t = today(), out = [];
    var n = eventsOn(t).filter(function (e) { return evKind(e) === 'normal'; }).length;
    out.push('<span>📅 ' + (n ? n + ' Termin' + (n > 1 ? 'e' : '') + ' heute' : 'Heute frei') + '</span>');
    [0, 1].forEach(function (k) {
      eventsOn(addDays(t, k)).filter(function (e) { return evKind(e) === 'waste'; }).forEach(function (e) {
        out.push('<span class="hot">🗑️ ' + (k === 0 ? 'Heute' : 'Morgen') + ': ' + esc(e.title) + '</span>');
      });
    });
    for (var i = 0; i < 14; i++) {
      var hol = eventsOn(addDays(t, i)).filter(function (e) { return evKind(e) === 'holiday'; })[0];
      if (hol) { out.push('<span>🎉 ' + (i === 0 ? 'Heute' : i === 1 ? 'Morgen' : 'in ' + i + ' Tagen') + ': ' + esc(hol.title) + '</span>'); break; }
    }
    var nx = upcoming(now).filter(function (e) { return !e.allDay; })[0];
    if (nx) {
      var ms = evStart(nx) - now;
      if (ms < 3 * 3600000) out.push('<span>⏰ ' + esc(nx.title) + ' in ' + inText(ms) + '</span>');
    }
    return out.join('');
  }
  function openDay(d) {
    var list = eventsOn(d);
    var h = sheetHead(dayLabel(d) === 'Heute' || dayLabel(d) === 'Morgen' ? dayLabel(d) + ', ' + d.getDate() + '. ' + MON_LONG[d.getMonth()] : dateLong(d)) + '<div class="sh-b">';
    if (!list.length) h += '<div class="empty">Noch nichts geplant.</div>';
    var now = new Date();
    list.forEach(function (ev) { h += evRow(ev, d, now); });
    h += '</div><div class="sh-f"><button class="btn primary" id="dayAdd">＋ Termin an diesem Tag</button></div>';
    var sh = openSheet(h);
    bindEventClicks(sh.el);
    $$('[data-ev]', sh.el).forEach(function (el) { var orig = el.onclick; el.onclick = function (e) { sh.close(); orig.call(el, e); }; });
    $('#dayAdd', sh.el).onclick = function () { sh.close(); openEditor(null, ymd(d)); };
  }
  function wallMenu() {
    var locked = store('fw.kiosk') === '1';
    var h = sheetHead('Family Wall') + '<div class="sh-b">' +
      '<button class="btn block" id="mFull">Vollbild</button>' +
      '<button class="btn block" id="mSync">Jetzt synchronisieren</button>' +
      (locked ? '<p class="hint">Kindersicherung ist an. Zum Entsperren die Uhr 3 Sekunden gedrückt halten.</p>'
        : '<button class="btn block" id="mSet">Einstellungen</button><button class="btn block" id="mMobile">Zur Handy-Ansicht</button><button class="btn block" id="mLock">Kindersicherung an</button>') +
      '</div>';
    var sh = openSheet(h);
    $('#mFull', sh.el).onclick = function () { var el = document.documentElement; var fn = el.requestFullscreen || el.webkitRequestFullscreen; if (fn) { try { fn.call(el); } catch (e) { /* egal */ } } sh.close(); };
    $('#mSync', sh.el).onclick = function () { sh.close(); api('POST', '/api/sync').then(function (bb) { S.boot = bb; return loadEvents(); }).then(function () { toast('Alles aktuell ✓'); }, function (e) { toast(e.message); }); };
    if (!locked) {
      $('#mSet', sh.el).onclick = function () { sh.close(); openSettings(); };
      $('#mMobile', sh.el).onclick = function () { store('fw.device', 'mobile'); location.href = '/'; };
      $('#mLock', sh.el).onclick = function () { store('fw.kiosk', '1'); sh.close(); toast('Kindersicherung an'); };
    }
  }
  // Uhr 3 s gedrückt halten = Kindersicherung aus
  function bindUnlock() {
    var timer = null;
    document.addEventListener('pointerdown', function (e) {
      if (!e.target.closest || !e.target.closest('#clock')) return;
      timer = setTimeout(function () { store('fw.kiosk', null); toast('Kindersicherung aus'); vibrate(40); }, 3000);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (n) { document.addEventListener(n, function () { clearTimeout(timer); }); });
  }
  // Leichtes Verschieben gegen Einbrennen
  var shift = [0, 0];
  function burnShift() { var w = $('#wall'); if (w) w.style.transform = 'translate(' + shift[0] + 'px,' + shift[1] + 'px)'; }
  function wakeLock() {
    try { if (navigator.wakeLock && document.visibilityState === 'visible') navigator.wakeLock.request('screen').catch(function () { /* egal */ }); } catch (e) { /* egal */ }
  }

  // ---------------------------------------------------------------- Start
  function render() {
    if (!S.boot) return;
    if ($('.overlay.show') && MODE === 'mobile') {
      // Liste im Hintergrund trotzdem aktualisieren
    }
    if (MODE === 'fluss') { if (window.FWFluss) window.FWFluss.render(); return; }
    if (MODE === 'wall') renderWall(); else renderMobile();
  }

  function init() {
    if (MODE === 'mobile' && store('fw.device') === 'wall') { location.replace('/wall'); return; }
    if (MODE === 'fluss' && window.FWFluss) window.FWFluss.init();
    loadAll().then(function () {
      connectLive();
      loadWeather();
      // App-Verknüpfung „Neuer Termin“ (lange auf das App-Symbol drücken)
      if (location.hash === '#neu') { history.replaceState(null, '', location.pathname); openEditor(null, null); }
    }, function (e) {
      if (!S.boot && !S.needLogin) $('#app').innerHTML = '<div class="login"><div class="card"><h1>Hoppla</h1><p>' + esc(e.message) + '</p><button class="btn primary" onclick="location.reload()">Nochmal versuchen</button></div></div>';
    });
    // Regelmäßig auffrischen (falls Live-Updates ausfallen)
    setInterval(function () { loadEvents().catch(function () { render(); }); }, MODE === 'wall' ? 120000 : 300000);
    if (MODE === 'wall') {
      setInterval(function () {
        if (!S.boot) return;
        var c = $('#clock');
        var wasNight = !!$('#night'), night = inNight();
        if (c && !night && !$('.overlay.show')) render();
        else if (night !== wasNight) render();
        else if (night) { var nc = $('#night .c'); if (nc) nc.textContent = hm(new Date()); }
      }, 20000);
      setInterval(loadWeather, 30 * 60000);
      setInterval(function () { shift = [Math.round(Math.random() * 6 - 3), Math.round(Math.random() * 6 - 3)]; burnShift(); }, 10 * 60000);
      setTimeout(function () { location.reload(); }, 12 * 3600000); // alle 12 Std. frisch laden
      document.addEventListener('visibilitychange', wakeLock);
      document.addEventListener('click', wakeLock, { once: true });
      bindUnlock();
    } else {
      document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && S.boot) loadEvents().catch(function () { render(); }); });
    }
  }

  // Gemeinsame Bausteine für den Tagesfluss (fluss.js)
  window.FW = {
    api: api, toast: toast, openSheet: openSheet, sheetHead: sheetHead, esc: esc, icon: icon, store: store, vibrate: vibrate,
    hexRgba: hexRgba, tint: tint, ymd: ymd, parseYmd: parseYmd, addDays: addDays, today: today, hm: hm, dateLong: dateLong,
    WD_SHORT: WD_SHORT, WD_LONG: WD_LONG, MON_LONG: MON_LONG,
    state: function () { return S; }, person: person, evKind: evKind, evStart: evStart, evEnd: evEnd, eventsOn: eventsOn,
    openEditor: function (d) { openEditor(null, d || null); }, openSettings: function (f) { openSettings(f); }, reloadEvents: function () { return loadEvents(); },
  };

  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () { /* egal */ }); });
  }
  init();
})();
