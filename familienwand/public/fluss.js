/* Tagesfluss – ADHS-Tagesbegleiter mit Spiel-Elementen (eine Sache zur Zeit, sichtbare Zeit,
   immer genug Puffer, für jeden Schritt eine kleine Belohnung). Nutzt die Bausteine aus app.js (window.FW). */
(function () {
  'use strict';
  var FW = null;
  var F = { pid: null, st: null, tab: 'jetzt', date: null, sound: true, notified: {}, busy: false, actx: null };
  var RAR = { normal: 'Normal', shiny: 'Glänzend', glitter: 'Glitzer ✨' };
  var RAR_ACH = { common: 'Gewöhnlich', rare: 'Selten', epic: 'Episch', legendary: 'Legendär' };
  var EMOJIS = ['⭐', '🧹', '👕', '🍲', '🛒', '📞', '✉️', '🚿', '🧽', '🌱', '📚', '💻', '🏃', '🧘', '🎨', '🐶', '🚗', '💊'];
  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function $(s, el) { return (el || document).querySelector(s); }
  function $$(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }
  function esc(s) { return FW.esc(s); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function hmMs(ms) { var d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function durTxt(m) { m = Math.round(m); if (m < 60) return m + ' Min'; var h = Math.floor(m / 60), r = m % 60; return h + ' Std' + (r ? ' ' + r + ' Min' : ''); }
  function atMs(date, hhmm) { var d = FW.parseYmd(date), p = hhmm.split(':'); d.setHours(+p[0], +p[1], 0, 0); return d.getTime(); }
  function todayYmd() { return FW.ymd(FW.today()); }
  function person() { return F.pid ? FW.person(F.pid) : null; }
  function api(method, path, body) { return FW.api(method, '/api/fluss/' + encodeURIComponent(F.pid) + path, body); }

  // ---------------------------------------------------------------- Planung
  function rocksFor(date) {
    var d = FW.parseYmd(date);
    return FW.eventsOn(d).filter(function (e) {
      if (e.allDay || FW.evKind(e) !== 'normal') return false;
      return !e.people || !e.people.length || e.people.indexOf(F.pid) >= 0;
    }).map(function (e) { return { id: e.calendarId + '|' + e.id, title: e.title, s: FW.evStart(e).getTime(), e: FW.evEnd(e).getTime(), location: e.location }; });
  }
  function planFor(date, now) {
    var st = F.st;
    var blocks = (date === st.date ? st.day.blocks : []).map(function (b) {
      return { id: b.id, title: b.title, emoji: b.emoji, kind: b.kind, dur: b.dur, ext: b.ext || 0, status: b.status, note: b.note, postponeCount: b.postponeCount,
        sticker: b.sticker, rarity: b.rarity, coins: b.coins,
        startedAtMs: b.startedAt ? Date.parse(b.startedAt) : null, doneAtMs: b.doneAt ? Date.parse(b.doneAt) : null, atMs: b.at ? atMs(date, b.at) : null, at: b.at };
    });
    return window.FWPlan.plan({ now: now || Date.now(), dayEnd: atMs(date, st.settings.dayEnd || '21:00'), rocks: rocksFor(date), blocks: blocks });
  }

  // ---------------------------------------------------------------- Laden
  function load(date) {
    if (!F.pid) return Promise.resolve();
    F.date = date || F.date || todayYmd();
    return api('GET', '?date=' + F.date).then(function (j) { F.st = j.state; draw(); }, function (e) { FW.toast(e.message); });
  }
  function act(path, body, opts) {
    if (F.busy) return Promise.resolve(null);
    F.busy = true;
    return api('POST', path + '?date=' + F.date, body || {}).then(function (j) {
      F.busy = false; F.st = j.state;
      if (!(opts && opts.noDraw)) draw();
      if (j.achievements && j.achievements.length) setTimeout(function () { showAchievements(j.achievements); }, 400);
      return j;
    }, function (e) { F.busy = false; FW.toast(e.message); return null; });
  }

  // ---------------------------------------------------------------- Sound, Haptik, Konfetti
  function beep(kind) {
    if (!F.sound) return;
    try {
      F.actx = F.actx || new (window.AudioContext || window.webkitAudioContext)();
      var notes = kind === 'big' ? [523, 659, 784, 1047, 1319] : kind === 'coin' ? [988, 1319] : [660, 880];
      notes.forEach(function (f, i) {
        var o = F.actx.createOscillator(), g = F.actx.createGain();
        o.type = kind === 'coin' ? 'square' : 'sine'; o.frequency.value = f;
        var t = F.actx.currentTime + i * 0.08;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(kind === 'coin' ? 0.04 : 0.11, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        o.connect(g); g.connect(F.actx.destination); o.start(t); o.stop(t + 0.3);
      });
    } catch (e) { /* egal */ }
    FW.vibrate(kind === 'big' ? [30, 40, 30, 40, 60] : [20]);
  }
  var parts = [], raf = 0, cv = null, cx = null;
  function canvas() {
    if (!cv) { cv = document.createElement('canvas'); cv.className = 'fl-fx'; document.body.appendChild(cv); cx = cv.getContext('2d'); }
    var d = window.devicePixelRatio || 1; cv.width = innerWidth * d; cv.height = innerHeight * d; cx.setTransform(d, 0, 0, d, 0, 0);
  }
  function burst(x, y, n) {
    if (reduced) return;
    canvas();
    var cs = getComputedStyle(document.documentElement);
    var cols = ['--accent', '--fl-sun', '--fl-mint', '--sky', '--fl-peach'].map(function (v) { return cs.getPropertyValue(v).trim() || '#D3367A'; });
    for (var i = 0; i < n; i++) parts.push({ x: x, y: y, vx: (Math.random() - 0.5) * 12, vy: -Math.random() * 12 - 3, r: Math.random() * 5 + 3, c: cols[i % cols.length], a: Math.random() * 6, va: (Math.random() - 0.5) * 0.4, sh: i % 3, life: 1 });
    if (!raf) raf = requestAnimationFrame(loop);
  }
  function loop() {
    cx.clearRect(0, 0, innerWidth, innerHeight);
    parts.forEach(function (p) {
      p.vy += 0.33; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.a += p.va; p.life -= 0.006;
      cx.save(); cx.globalAlpha = Math.max(p.life, 0); cx.translate(p.x, p.y); cx.rotate(p.a); cx.fillStyle = p.c;
      if (p.sh === 0) cx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
      else if (p.sh === 1) { cx.beginPath(); cx.arc(0, 0, p.r * 0.7, 0, 7); cx.fill(); }
      else { cx.beginPath(); for (var k = 0; k < 5; k++) { var a = k * 1.2566 - 1.5708; cx.lineTo(Math.cos(a) * p.r, Math.sin(a) * p.r); var a2 = a + 0.628; cx.lineTo(Math.cos(a2) * p.r * 0.45, Math.sin(a2) * p.r * 0.45); } cx.fill(); }
      cx.restore();
    });
    parts = parts.filter(function (p) { return p.y < innerHeight + 30 && p.life > 0; });
    raf = parts.length ? requestAnimationFrame(loop) : 0;
  }
  function center(el) { var r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
  function coinFly(fromEl, amount, done) {
    var to = $('#flCoins');
    if (!to || !fromEl || reduced || !Element.prototype.animate) { if (done) done(); return; }
    var a = center(fromEl), b = center(to), k = Math.min(8, 3 + Math.floor(amount / 5));
    for (var i = 0; i < k; i++) (function (i) {
      var c = document.createElement('span'); c.className = 'fl-coin'; c.textContent = '🪙';
      c.style.left = (a.x - 11) + 'px'; c.style.top = (a.y - 11) + 'px'; document.body.appendChild(c);
      var dx = b.x - a.x, dy = b.y - a.y, mx = (Math.random() - 0.5) * 120;
      var an = c.animate([{ transform: 'translate(0,0) scale(1)' }, { transform: 'translate(' + (dx * 0.4 + mx) + 'px,' + (dy * 0.3 - 60) + 'px) scale(1.3)' }, { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.6)' }],
        { duration: 750, delay: i * 70, easing: 'cubic-bezier(.5,0,.6,1)', fill: 'forwards' });
      an.onfinish = function () { if (c.parentNode) c.parentNode.removeChild(c); if (i === k - 1) { bump(to); if (done) done(); } else beep('coin'); };
    })(i);
  }
  function bump(el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }

  // In-App-Hinweis (wie eine Push-Nachricht)
  var pushT;
  function banner(msg) {
    var b = $('#flPush');
    if (!b) { b = document.createElement('div'); b.id = 'flPush'; b.className = 'fl-push'; b.setAttribute('role', 'status'); document.body.appendChild(b); }
    b.innerHTML = '<div class="ai">t</div><div><div class="h"><span>Tagesfluss</span><span>jetzt</span></div><div class="b">' + esc(msg) + '</div></div>';
    b.classList.add('show'); clearTimeout(pushT); pushT = setTimeout(function () { b.classList.remove('show'); }, 5200);
    beep();
  }

  // ---------------------------------------------------------------- Rahmen
  function greeting() { var h = new Date().getHours(); return h < 11 ? 'Guten Morgen' : h < 17 ? 'Hallo' : 'Guten Abend'; }

  function draw() {
    if (!FW || !FW.state().boot) return;
    if (!F.pid || !person()) return drawPick();
    if (!F.st) { $('#app').innerHTML = '<div class="boot"><div class="boot-logo"></div>Dein Tag lädt …</div>'; return load(); }
    var st = F.st, p = person(), lv = st.level;
    var lvPct = lv.next ? Math.round((st.lifetime - lv.min) / (lv.next - lv.min) * 100) : 100;
    var h = '<div class="fl">';
    h += '<header class="fl-h"><div class="fl-hi"><div class="fl-day">' + greeting() + ', ' + esc(p.name) + '</div><div class="fl-sub">' + FW.dateLong(new Date()) + '</div></div>' +
      '<div class="fl-pills"><button class="fl-pill lv" id="flLv" title="Level ' + lv.level + '">' + lv.emoji + ' ' + lv.level + '<i style="width:' + lvPct + '%"></i></button>' +
      '<span class="fl-pill coins" id="flCoins">🪙 ' + st.coins + '</span>' +
      '<span class="fl-pill streak" title="Tage in Folge">🔥 ' + st.streak.current + (st.streak.atRisk ? ' 🛡️' : '') + '</span>' +
      '<button class="fl-pill snd" id="flSnd" aria-label="Ton an oder aus">' + (F.sound ? '🔊' : '🔈') + '</button></div></header>';
    h += '<div class="fl-stars-row">' + starsHtml(st.day.stars) + (st.day.combo >= 2 ? '<span class="fl-combo">🔥 Combo x' + (st.day.combo >= 3 ? '2' : '1,5') + '</span>' : '') +
      (st.streak.atRisk ? '<span class="fl-joker">🛡️ Dein Joker rettet die Serie, sobald du heute etwas schaffst</span>' : '') + '</div>';
    h += '<main class="fl-main" id="flMain">' + (F.tab === 'jetzt' ? vJetzt() : F.tab === 'tag' ? vTag() : F.tab === 'album' ? vAlbum() : vAbend()) + '</main>';
    h += '<nav class="fl-tabs" role="tablist">' + [['jetzt', '⏱️', 'Jetzt'], ['tag', '🗺️', 'Mein Tag'], ['album', '📒', 'Album'], ['abend', '🌙', 'Abend']].map(function (t) {
      return '<button role="tab" data-tab="' + t[0] + '" aria-selected="' + (F.tab === t[0]) + '"><span>' + t[1] + '</span>' + t[2] + '</button>';
    }).join('') + '</nav></div>';
    $('#app').innerHTML = h;
    bindCommon();
  }
  function starsHtml(n) { var s = ''; for (var i = 0; i < 3; i++) s += '<span class="' + (i < n ? 'on' : '') + '">⭐</span>'; return '<span class="fl-stars" title="Sterne heute">' + s + '</span>'; }

  function drawPick() {
    var b = FW.state().boot;
    var h = '<div class="fl fl-pick"><div class="card"><h1>Tagesfluss</h1><p>Dein persönlicher Begleiter durch den Tag: eine Sache zur Zeit, immer genug Puffer – und für jeden Schritt eine kleine Belohnung.</p><p><b>Für wen ist dieses Handy?</b></p><div class="chips">' +
      b.people.map(function (p) { return '<button class="chip" data-pick="' + esc(p.id) + '"><span class="em">' + esc(p.emoji) + '</span>' + esc(p.name) + '</button>'; }).join('') +
      '</div><p class="hint">Termine dieser Person und der ganzen Familie werden automatisch als feste Punkte eingeplant.</p><a class="btn small" href="/">Zur Familien-Ansicht</a></div></div>';
    $('#app').innerHTML = h;
    $$('[data-pick]').forEach(function (el) { el.onclick = function () { F.pid = el.getAttribute('data-pick'); FW.store('fw.flussPerson', F.pid); F.st = null; draw(); }; });
  }

  function bindCommon() {
    $$('[data-tab]').forEach(function (el) { el.onclick = function () { F.tab = el.getAttribute('data-tab'); if (F.tab !== 'tag' && F.date !== todayYmd()) { F.date = todayYmd(); F.st = null; } draw(); var m = $('#flMain'); if (m) m.scrollTop = 0; }; });
    $('#flSnd').onclick = function () { F.sound = !F.sound; FW.store('fw.sound', F.sound ? '1' : '0'); draw(); };
    $('#flLv').onclick = levelSheet;
    var root = $('#flMain');
    if (F.tab === 'jetzt') bindJetzt(root);
    if (F.tab === 'tag') bindTag(root);
    if (F.tab === 'album') bindAlbum(root);
    if (F.tab === 'abend') bindAbend(root);
  }

  // ---------------------------------------------------------------- JETZT
  function findBlock(id) { var l = F.st.day.blocks; for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; }
  // Restzeit nie wie eine Uhrzeit schreiben („15:00“ verwirrt) – Minuten, nur in der letzten Minute Sekunden
  function remTxt(ms) { if (ms <= 0) return '+' + Math.floor(-ms / 60000) + ' Min'; if (ms < 60000) return Math.ceil(ms / 1000) + ' Sek'; return Math.ceil(ms / 60000) + ' Min'; }

  function vJetzt() {
    var st = F.st;
    if (st.date !== todayYmd()) { F.date = todayYmd(); F.st = null; load(); return ''; }
    var pl = planFor(st.date), cur = pl.current, now = Date.now(), h = '';
    var openBlocks = st.day.blocks.filter(function (b) { return b.status === 'todo' || b.status === 'now'; });

    if (!st.day.blocks.length) {
      h += '<section class="fl-card fl-start"><span class="fl-eyebrow">Neuer Tag</span><h2>Was steht heute an?</h2><p>Such dir 2–3 kleine Dinge aus. Mehr braucht es nicht. Termine aus dem Familienkalender sind schon eingeplant.</p>' +
        '<div class="fl-routines">' + st.routines.map(function (r) { return '<button class="fl-rt" data-routine="' + r.key + '"><span>' + r.emoji + '</span>' + esc(r.title) + '<small>' + r.blocks.length + ' Blöcke · ' + durTxt(r.blocks.reduce(function (a, b) { return a + b.dur; }, 0)) + '</small></button>'; }).join('') + '</div>' +
        '<div class="chips">' + st.templates.slice(0, 8).map(tplChip).join('') + '</div></section>';
    }

    if (cur && cur.type === 'block' && cur.state === 'now') {
      var b = cur.b, total = (b.dur + (b.ext || 0)) * 60000, rem = cur.e - now, over = rem <= 0;
      h += '<section class="fl-now' + (b.kind === 'pause' ? ' pause' : '') + '"><span class="fl-eyebrow">' + (b.kind === 'pause' ? 'Pause – die hast du dir verdient' : 'Jetzt dran') + '</span>' +
        '<div class="fl-ring' + (over ? ' over' : '') + '" id="flRing"><svg viewBox="0 0 240 240"><circle class="track" cx="120" cy="120" r="104" fill="none" stroke-width="18"/><circle class="arc" id="flArc" cx="120" cy="120" r="104" fill="none" stroke-width="18" stroke-linecap="round" stroke-dasharray="653.5" stroke-dashoffset="' + (653.5 * (1 - Math.max(rem, 0) / total)) + '"/></svg>' +
        '<div class="in"><div class="em">' + esc(b.emoji) + '</div><div class="rem" id="flRem">' + remTxt(rem) + '</div><div class="sub" id="flRemSub">' + (over ? 'Zeit ist um' : 'bis ' + hmMs(cur.e)) + '</div></div></div>' +
        '<h2>' + esc(b.title) + '</h2>' + (b.note ? '<p class="fl-note">' + esc(b.note) + '</p>' : '') + ((b.postponeCount || 0) >= 3 ? '<p class="fl-x2">🦸 Schon ' + b.postponeCount + '× verschoben – heute gibt es doppelte Münzen!</p>' : '') +
        '<p class="fl-over" id="flOver"' + (over ? '' : ' hidden') + '>Super durchgehalten! Mach in Ruhe einen Abschluss ✨</p>' +
        '<div class="fl-actions"><button class="fl-main-btn" data-done="' + b.id + '">' + (b.kind === 'pause' ? 'Pause beendet ✓' : 'Fertig! ✓') + '</button>' +
        '<button class="fl-soft" data-ext="' + b.id + '">＋10 Min</button>' +
        (b.kind !== 'pause' && b.dur >= 20 ? '<button class="fl-soft" data-split="' + b.id + '">✂️ Kleiner</button>' : '<button class="fl-soft" data-later="' + b.id + '">Später</button>') +
        '<button class="fl-soft" data-tomorrow="' + b.id + '">' + (b.kind === 'pause' ? 'Überspringen' : 'Auf morgen') + '</button></div></section>';
    } else if (cur && cur.type === 'block' && cur.anchored) {
      h += '<section class="fl-now"><span class="fl-eyebrow">Um ' + hmMs(cur.s) + '</span><div class="fl-big">' + esc(cur.b.emoji) + '</div><h2>' + esc(cur.b.title) + '</h2>' +
        (cur.b.note ? '<p class="fl-note">' + esc(cur.b.note) + '</p>' : '') + '<p class="fl-note">noch ' + durTxt(Math.max(0, (cur.s - now) / 60000)) + ' bis dahin – ganz entspannt</p>' +
        '<div class="fl-actions"><button class="fl-main-btn" data-start="' + cur.b.id + '">Schon jetzt starten ▶</button></div></section>';
    } else if (cur && cur.type === 'block') {
      h += '<section class="fl-now"><span class="fl-eyebrow">Bereit?</span><div class="fl-big">' + esc(cur.b.emoji) + '</div><h2>' + esc(cur.b.title) + '</h2><p class="fl-note">' + durTxt(cur.b.dur) + (cur.b.note ? ' · ' + esc(cur.b.note) : '') + '</p>' +
        (st.energy === 'low' && cur.b.dur > 15 ? '<p class="fl-note">Wenig Energie? Fang einfach an – nach 10 Minuten darfst du neu entscheiden.</p>' : '') +
        '<div class="fl-actions"><button class="fl-main-btn" data-start="' + cur.b.id + '">Los geht\'s ▶</button>' + (cur.b.dur >= 20 ? '<button class="fl-soft" data-split="' + cur.b.id + '">✂️ Kleiner machen</button>' : '') + '<button class="fl-soft" data-tomorrow="' + cur.b.id + '">Auf morgen</button></div></section>';
    } else if (cur && cur.type === 'rock') {
      var live = cur.state === 'live';
      h += '<section class="fl-now calm"><span class="fl-eyebrow">' + (live ? 'Gerade' : 'Frei bis ' + hmMs(cur.s)) + '</span><div class="fl-big">' + (live ? '📅' : '🌿') + '</div>' +
        '<h2>' + (live ? esc(cur.rock.title) : durTxt((cur.s - now) / 60000) + ' nur für dich') + '</h2><p class="fl-note">' + (live ? 'bis ' + hmMs(cur.e) + ' · Genieß es, danach geht es entspannt weiter.' : 'Dann: 📅 ' + esc(cur.rock.title) + '. Du musst gerade nichts.') + '</p>' +
        (live ? '' : '<div class="chips fl-qw">' + quickWins(Math.floor((cur.s - now) / 60000)).map(tplChip).join('') + '</div>') + '</section>';
    } else if (st.day.blocks.length) {
      h += '<section class="fl-now calm"><span class="fl-eyebrow">' + (openBlocks.length ? '' : 'Alles erledigt') + '</span><div class="fl-big">🎉</div><h2>Du hast alles geschafft!</h2><p class="fl-note">Schau in den Abend-Tab – dort wartet deine Truhe.</p>' +
        '<div class="fl-actions"><button class="fl-main-btn" data-goto="abend">Zur Abend-Truhe 🎁</button></div></section>';
    }

    if (st.day.blocks.length || pl.items.length) h += bufferCard(pl);

    // Danach
    var nx = [], seen = false;
    pl.items.forEach(function (it) { if (it.type === 'gap' || it.state === 'done' || it.state === 'past') return; if (!seen && it === cur) { seen = true; return; } if (seen && nx.length < 3) nx.push(it); });
    if (nx.length) {
      h += '<section class="fl-next"><div class="fl-sec">Danach</div>' + nx.map(function (it) {
        var isRock = it.type === 'rock';
        return '<div class="fl-nrow' + (isRock ? ' rock' : '') + '"><span class="ic">' + (isRock ? '📅' : esc(it.b.emoji)) + '</span><span class="t">' + esc(isRock ? it.rock.title : it.b.title) +
          '<small>' + (isRock ? 'Familienkalender' : it.anchored ? 'feste Startzeit' : durTxt(it.b.dur + (it.b.ext || 0))) + '</small></span><span class="tm">' + hmMs(it.s) + '</span></div>';
      }).join('') + '</section>';
    }

    // Energie-Check-in (momo)
    h += '<section class="fl-energy"><div class="fl-sec">Wie ist deine Energie gerade?</div><div class="fl-en">' +
      [['low', '🪫', 'wenig'], ['mid', '🙂', 'okay'], ['high', '⚡', 'viel']].map(function (x) { return '<button data-en="' + x[0] + '" aria-pressed="' + (st.energy === x[0]) + '"><span>' + x[1] + '</span>' + x[2] + '</button>'; }).join('') + '</div>' +
      (st.energy === 'low' ? '<p class="fl-note">Sanfter Modus 💛 Kleine Erfolge zählen voll:</p><div class="chips">' + quickWins(15).map(tplChip).join('') + '</div>' : '') +
      (st.energy === 'high' ? '<p class="fl-note">Super! Wie wär\'s mit etwas, das schon lange wartet?</p>' : '') + '</section>';
    return h;
  }
  function quickWins(maxMin) { return F.st.templates.filter(function (t) { return t.dur <= Math.max(5, Math.min(15, maxMin)); }).slice(0, 6); }
  function tplChip(t) { return '<button class="chip fl-tpl" data-tpl="' + esc(JSON.stringify(t)) + '"><span class="em">' + esc(t.emoji) + '</span>' + esc(t.title) + ' ' + t.dur + '′</button>'; }

  function bufTxt(g) { return g >= 0 ? durTxt(g) + ' Luft' : '−' + durTxt(-g); }
  function bufferCard(pl) {
    var bf = pl.buffer, now = Date.now();
    if (!bf) return '';
    var g = bf.min, mood = window.FWPlan.mood(g);
    var target = bf.before ? (bf.before.rock ? '📅 ' + bf.before.rock.title : bf.before.b.emoji + ' ' + bf.before.b.title) + ' um ' + hmMs(bf.before.s) : 'Feierabend um ' + F.st.settings.dayEnd;
    var targetMs = bf.before ? bf.before.s : atMs(F.st.date, F.st.settings.dayEnd);
    var msg = g >= 30 ? 'Alles im grünen Bereich – du hast genug Zeit. 😌'
      : g >= 10 ? 'Etwas knapp, aber machbar. Eine Pause kürzer, und es passt locker.'
        : g >= 0 ? 'Ziemlich eng. Magst du etwas auf morgen schieben?'
          : (-g) + ' Min mehr geplant als Zeit da ist. Schieb etwas auf morgen – das ist völlig okay.';
    // Balken: Aufgaben, Pausen, Luft zwischen jetzt und Ziel
    var segs = '', span = Math.max(targetMs - now, 1);
    pl.items.forEach(function (it) {
      if (it.type !== 'block' || it.state === 'done' || it.s >= targetMs) return;
      var s = Math.max(it.s, now), w = Math.max(Math.min(it.e, targetMs) - s, 0);
      if (w > 0) segs += '<span style="flex:' + w + ';background:var(' + (it.b.kind === 'pause' ? '--sky' : '--accent') + ')"></span>';
    });
    if (g > 0) segs += '<span style="flex:' + g * 60000 + ';background:var(--fl-mint);opacity:.55"></span>';
    var lastFlex = null;
    pl.items.forEach(function (it) { if (it.type === 'block' && it.state === 'todo' && !it.anchored && it.s < targetMs) lastFlex = it.b; });
    return '<section class="fl-buf ' + mood + '"><div class="top"><span class="fl-eyebrow">Bis ' + esc(target) + '</span><span class="big" id="flBuf">' + bufTxt(g) + '</span></div>' +
      '<div class="bar">' + segs + '</div><div class="legend"><span><i style="background:var(--accent)"></i>Aufgaben</span><span><i style="background:var(--sky)"></i>Pausen</span><span><i style="background:var(--fl-mint)"></i>Luft</span></div>' +
      '<p>' + msg + '</p>' + (bf.pushed && bf.pushed.length ? '<p class="fl-note">↪ ' + esc(bf.pushed.join(', ')) + ' ' + (bf.pushed.length > 1 ? 'passen' : 'passt') + ' nicht mehr davor und ' + (bf.pushed.length > 1 ? 'kommen' : 'kommt') + ' danach.</p>' : '') +
      (g < 10 && lastFlex ? '<button class="fl-soft small" data-tomorrow="' + lastFlex.id + '">„' + esc(lastFlex.title) + '“ auf morgen</button>' : '') + '</section>';
  }

  function bindJetzt(root) {
    bindBlockActions(root);
    $$('[data-en]', root).forEach(function (el) {
      el.onclick = function () {
        var lv = el.getAttribute('data-en');
        act('/energy', { level: lv }).then(function () {
          FW.toast(lv === 'low' ? 'Sanfter Modus: kleine Schritte zählen voll 💛' : lv === 'mid' ? 'Gut so! Ein Block nach dem anderen.' : 'Super! Dann los ⚡');
        });
      };
    });
    $$('[data-routine]', root).forEach(function (el) {
      el.onclick = function () {
        var r = F.st.routines.filter(function (x) { return x.key === el.getAttribute('data-routine'); })[0];
        act('/blocks', { blocks: r.blocks }).then(function (j) { if (j) { FW.toast(r.emoji + ' ' + r.title + ' eingeplant'); beep(); } });
      };
    });
    var g = $('[data-goto]', root); if (g) g.onclick = function () { F.tab = g.getAttribute('data-goto'); draw(); };
  }

  function bindBlockActions(root) {
    $$('[data-done]', root).forEach(function (el) { el.onclick = function () { complete(el.getAttribute('data-done'), el); }; });
    $$('[data-start]', root).forEach(function (el) { el.onclick = function () { act('/blocks/' + el.getAttribute('data-start') + '/start').then(function (j) { if (j) { beep(); FW.toast('Los geht\'s! Du schaffst das.'); } }); }; });
    $$('[data-ext]', root).forEach(function (el) {
      el.onclick = function () {
        act('/blocks/' + el.getAttribute('data-ext') + '/extend', { min: 10 }).then(function (j) {
          if (!j) return; var bf = planFor(F.st.date).buffer;
          FW.toast(bf && bf.min >= 10 ? 'Kein Problem – noch ' + bf.min + ' Min Luft 🌿' : 'Okay! Schau kurz auf den Puffer.');
        });
      };
    });
    $$('[data-split]', root).forEach(function (el) { el.onclick = function () { act('/blocks/' + el.getAttribute('data-split') + '/split').then(function (j) { if (j) FW.toast('✂️ Halbiert, mit Mini-Pause dazwischen. Kleiner ist leichter!'); }); }; });
    $$('[data-later]', root).forEach(function (el) { el.onclick = function () { act('/blocks/' + el.getAttribute('data-later') + '/later').then(function (j) { if (j) FW.toast('Kommt nach dem nächsten Block.'); }); }; });
    $$('[data-tomorrow]', root).forEach(function (el) { el.onclick = function () { act('/blocks/' + el.getAttribute('data-tomorrow') + '/tomorrow').then(function (j) { if (j) FW.toast('Auf morgen gemerkt – völlig okay 💛'); }); }; });
    $$('[data-tpl]', root).forEach(function (el) {
      el.onclick = function () {
        var t = JSON.parse(el.getAttribute('data-tpl'));
        act('/blocks', t).then(function (j) { if (j) { FW.toast('Eingeplant: ' + t.emoji + ' ' + t.title); FW.vibrate(10); } });
      };
    });
  }

  function complete(id, btn) {
    var a = btn ? center(btn) : { x: innerWidth / 2, y: innerHeight / 2 };
    act('/blocks/' + id + '/done', {}, { noDraw: true }).then(function (j) {
      if (!j) return;
      var r = j.reward;
      burst(a.x, a.y, r.starsAfter > r.starsBefore ? 160 : 90);
      beep(r.starsAfter > r.starsBefore || r.levelUp ? 'big' : '');
      coinFly(btn, r.coins);
      setTimeout(function () { reveal(r); draw(); }, reduced ? 0 : 650);
    });
  }

  function reveal(r) {
    var h = '<div class="fl-reveal"><span class="fl-eyebrow">' + (r.dupe ? 'Doppelter Sticker' : 'Neuer Sticker!') + '</span>' +
      '<div class="fl-flip" id="flFlip"><div class="in"><div class="face back">?</div><div class="face front ' + r.rarity + '">' + esc(r.sticker) + '</div></div></div>' +
      '<span class="fl-rar ' + r.rarity + '">' + RAR[r.rarity] + '</span>' +
      (r.starsAfter > r.starsBefore ? '<div class="fl-starup">' + new Array(r.starsAfter + 1).join('⭐') + ' ' + r.starsAfter + '. Stern für heute!</div>' : '') +
      (r.levelUp ? '<div class="fl-levelup">' + r.levelUp.emoji + ' Level ' + r.levelUp.level + ': ' + esc(r.levelUp.title) + '!</div>' : '') +
      '<div class="fl-rw">+' + r.coins + ' 🪙' + (r.mult > 1 ? ' · Combo x' + String(r.mult).replace('.', ',') : '') + '</div>' +
      (r.bonus && r.bonus.length ? '<div class="fl-note">' + r.bonus.map(esc).join(' · ') + '</div>' : '') +
      (r.shieldUsed ? '<div class="fl-note">🛡️ Joker eingesetzt – deine Serie ist gerettet!</div>' : '') +
      (r.setDone ? '<div class="fl-levelup">📒 Set komplett!</div>' : '') +
      '<button class="fl-main-btn" data-close>' + (r.started ? 'Weiter: ' + esc(r.started.emoji + ' ' + r.started.title) + ' ▶' : 'Weiter so ▶') + '</button></div>';
    var sh = FW.openSheet(h);
    setTimeout(function () {
      var f = $('#flFlip', sh.el); if (f) f.classList.add('open');
      if (r.rarity !== 'normal') { var c = f ? center(f) : { x: innerWidth / 2, y: innerHeight / 3 }; burst(c.x, c.y - 40, r.rarity === 'glitter' ? 120 : 60); beep('big'); }
    }, reduced ? 0 : 350);
    if (r.achievements && r.achievements.length) setTimeout(function () { showAchievements(r.achievements); }, 1800);
  }
  function showAchievements(list) {
    list.forEach(function (a, i) { setTimeout(function () { banner('🏆 Erfolg freigeschaltet: ' + a.emoji + ' ' + a.title + ' (+' + a.coins + ' Münzen)'); beep('big'); }, i * 2600); });
  }

  // ---------------------------------------------------------------- MEIN TAG
  function vTag() {
    var st = F.st, isToday = st.date === todayYmd();
    var now = isToday ? Date.now() : atMs(st.date, '07:00');
    var pl = planFor(st.date, now);
    var h = '<div class="seg fl-seg"><button data-date="today" aria-pressed="' + isToday + '">Heute</button><button data-date="tomorrow" aria-pressed="' + !isToday + '">Morgen planen' + (st.tomorrowCount && isToday ? ' (' + st.tomorrowCount + ')' : '') + '</button></div>';
    h += '<div class="fl-sec">' + (isToday ? 'Deine Level-Karte für heute' : 'Morgen, ' + FW.dateLong(FW.parseYmd(st.date))) + '</div><div class="fl-map">';
    if (!pl.items.length) h += '<p class="fl-note" style="padding:8px 0 8px 0">Noch leer. Unten Blöcke antippen – Termine aus dem Kalender erscheinen hier automatisch.</p>';
    pl.items.forEach(function (it) {
      if (it.type === 'gap') {
        if (it.min === 0 && !(it.pushed && it.pushed.length)) return;
        var md = window.FWPlan.mood(it.min);
        h += '<div class="fl-gap ' + md + '">' + (it.min >= 0 ? '🌿 ' + durTxt(it.min) + ' Luft' : '⚠︎ ' + (-it.min) + ' Min zu viel') + (it.pushed && it.pushed.length ? ' · ' + esc(it.pushed.join(', ')) + ' danach' : '') + '</div>';
        return;
      }
      if (it.type === 'rock') {
        h += '<div class="fl-stop rock ' + it.state + '"><div><div class="t"><span class="e">📅</span>' + esc(it.rock.title) + '</div><div class="fm">Familienkalender' + (it.rock.location ? ' · ' + esc(it.rock.location) : '') + '</div></div><div class="tm">' + hmMs(it.s) + '<br><small>' + hmMs(it.e) + '</small></div></div>';
        return;
      }
      var b = it.b;
      var meta = it.state === 'done' ? 'geschafft' + (b.coins ? ' · +' + b.coins + ' 🪙' : '') : it.state === 'now' ? 'läuft gerade · ' + durTxt(b.dur + (b.ext || 0)) : (b.at ? 'feste Startzeit · ' : '') + durTxt(b.dur + (b.ext || 0)) + ((b.postponeCount || 0) >= 3 ? ' · 🦸 x2' : '');
      h += '<button class="fl-stop ' + it.state + (b.kind === 'pause' ? ' pause' : '') + '" data-blk="' + b.id + '"><div><div class="t"><span class="e">' + esc(b.emoji) + '</span>' + esc(b.title) + '</div><div class="fm">' + meta + '</div></div>' +
        '<div class="tm">' + (b.sticker ? '<span class="stk ' + (b.rarity || '') + '">' + esc(b.sticker) + '</span><br>' : '') + hmMs(it.s) + '<br><small>' + hmMs(it.e) + '</small></div></button>';
    });
    if (pl.end) h += '<div class="fl-gap end ' + window.FWPlan.mood(pl.end.min) + '">🌙 Feierabend ' + st.settings.dayEnd + (pl.end.min >= 0 ? ' · noch ' + durTxt(pl.end.min) + ' frei' : ' · ' + (-pl.end.min) + ' Min zu viel geplant') + '</div>';
    h += '</div>';
    h += '<div class="fl-sec">Routinen – ein Tipp, alles drin</div><div class="fl-routines">' + st.routines.map(function (r) { return '<button class="fl-rt" data-routine="' + r.key + '"><span>' + r.emoji + '</span>' + esc(r.title) + '<small>' + durTxt(r.blocks.reduce(function (a, b) { return a + b.dur; }, 0)) + '</small></button>'; }).join('') + '</div>';
    h += '<div class="fl-sec">Block einplanen – der Puffer rechnet sofort mit</div><div class="chips">' + st.templates.map(tplChip).join('') + '</div>';
    h += '<button class="btn block" id="flOwn" style="margin-top:12px">＋ Eigener Block</button>';
    h += '<p class="fl-note">Termine aus dem Familienkalender sind „Felsen“ – deine Blöcke fließen drumherum. Tippe einen Block an zum Ändern.</p>';
    return h;
  }
  function bindTag(root) {
    $$('[data-date]', root).forEach(function (el) {
      el.onclick = function () { var t = todayYmd(); var d = el.getAttribute('data-date') === 'today' ? t : FW.ymd(FW.addDays(FW.today(), 1)); if (d !== F.date) { F.st = null; F.date = d; load(d); } };
    });
    bindBlockActions(root);
    bindJetzt(root);
    $$('[data-blk]', root).forEach(function (el) { el.onclick = function () { blockSheet(findBlock(el.getAttribute('data-blk'))); }; });
    $('#flOwn', root).onclick = function () { editSheet(null); };
  }

  function blockSheet(b) {
    if (!b) return;
    var isToday = F.st.date === todayYmd();
    var h = FW.sheetHead(b.emoji + ' ' + b.title) + '<div class="sh-b">';
    if (b.status === 'done') {
      h += '<p>Geschafft' + (b.doneAt ? ' um ' + hmMs(Date.parse(b.doneAt)) : '') + ' · +' + (b.coins || 0) + ' 🪙 · Sticker ' + esc(b.sticker || '') + '</p></div>';
      FW.openSheet(h); return;
    }
    h += '<div class="fl-sheet-acts">' +
      (isToday && b.status !== 'now' ? '<button class="fl-main-btn" data-a="start">▶ Jetzt starten</button>' : '') +
      (isToday && b.status === 'now' ? '<button class="fl-main-btn" data-a="done">✓ Fertig</button>' : '') +
      '<button class="btn" data-a="edit">✏️ Ändern</button>' +
      '<button class="btn" data-a="up">⬆️ Früher</button><button class="btn" data-a="down">⬇️ Später</button>' +
      (b.dur >= 20 ? '<button class="btn" data-a="split">✂️ Kleiner machen</button>' : '') +
      (isToday ? '<button class="btn" data-a="tomorrow">🌤️ Auf morgen</button>' : '') +
      '<button class="btn" data-a="delete" id="flDel">🗑️ Löschen</button></div></div>';
    var sh = FW.openSheet(h);
    $$('[data-a]', sh.el).forEach(function (el) {
      el.onclick = function () {
        var a = el.getAttribute('data-a');
        if (a === 'edit') { sh.close(); editSheet(b); return; }
        if (a === 'done') { sh.close(); complete(b.id, null); return; }
        if (a === 'delete' && !el.getAttribute('data-sure')) { el.setAttribute('data-sure', '1'); el.className = 'btn danger'; el.textContent = 'Wirklich löschen?'; return; }
        sh.close();
        act('/blocks/' + b.id + '/' + a).then(function (j) { if (j && a === 'tomorrow') FW.toast('Auf morgen gemerkt 💛'); if (j && a === 'start') beep(); });
      };
    });
  }

  function editSheet(b) {
    var f = b ? { title: b.title, emoji: b.emoji, dur: b.dur, kind: b.kind, at: b.at || '', by: '' } : { title: '', emoji: '⭐', dur: 30, kind: 'task', at: '', by: '' };
    var h = FW.sheetHead(b ? 'Block ändern' : 'Eigener Block') + '<form class="sh-b" id="flEf">' +
      '<input class="input qa-input" id="efT" placeholder="z. B. Steuerunterlagen sortieren" value="' + esc(f.title) + '">' +
      '<div class="field"><span class="label">Symbol</span><div class="chips">' + EMOJIS.map(function (e) { return '<button type="button" class="chip" data-em="' + e + '" aria-pressed="' + (f.emoji === e) + '">' + e + '</button>'; }).join('') + '</div></div>' +
      '<div class="field"><span class="label">Dauer</span><div class="chips">' + [5, 10, 15, 20, 30, 45, 60, 90].map(function (d) { return '<button type="button" class="chip" data-du="' + d + '" aria-pressed="' + (f.dur === d) + '">' + durTxt(d) + '</button>'; }).join('') + '</div></div>' +
      '<label class="switch"><input type="checkbox" id="efPause"' + (f.kind === 'pause' ? ' checked' : '') + '> Das ist eine Pause</label>' +
      '<div class="field"><span class="label">Zeit (optional)</span><div class="row-p"><label class="chip">Start um&nbsp;<input type="time" id="efAt" value="' + esc(f.at) + '"></label><label class="chip">Fertig sein um&nbsp;<input type="time" id="efBy"></label></div>' +
      '<p class="hint">„Fertig sein um“ rechnet rückwärts: Essen um 18:30 → Kochen startet um 17:45.</p></div>' +
      '<p class="err" id="efErr" hidden></p></form><div class="sh-f"><button class="btn primary" id="efSave">' + (b ? 'Speichern' : 'Einplanen') + '</button></div>';
    var sh = FW.openSheet(h), r = sh.el;
    function mark(sel, attr, val) { $$(sel, r).forEach(function (x) { x.setAttribute('aria-pressed', x.getAttribute(attr) === String(val)); }); }
    $$('[data-em]', r).forEach(function (x) { x.onclick = function () { f.emoji = x.getAttribute('data-em'); mark('[data-em]', 'data-em', f.emoji); }; });
    $$('[data-du]', r).forEach(function (x) { x.onclick = function () { f.dur = +x.getAttribute('data-du'); mark('[data-du]', 'data-du', f.dur); }; });
    function save() {
      f.title = $('#efT', r).value.trim();
      var at = $('#efAt', r).value, by = $('#efBy', r).value;
      if (by) { var m = (+by.split(':')[0]) * 60 + (+by.split(':')[1]) - f.dur; if (m < 0) m = 0; at = pad(Math.floor(m / 60)) + ':' + pad(m % 60); }
      var body = { title: f.title, emoji: f.emoji, dur: f.dur, kind: $('#efPause', r).checked ? 'pause' : 'task', at: at || null, note: by ? 'rückwärts geplant: fertig um ' + by : (b && b.note) || null };
      if (!body.title) { var e = $('#efErr', r); e.textContent = 'Wie heißt der Block?'; e.hidden = false; return; }
      sh.close();
      act(b ? '/blocks/' + b.id + '/edit' : '/blocks', body).then(function (j) { if (j) FW.toast(b ? 'Geändert ✓' : 'Eingeplant ✓' + (at ? ' – Start um ' + at : '')); });
    }
    $('#efSave', r).onclick = save;
    $('#flEf', r).onsubmit = function (e) { e.preventDefault(); save(); };
    if (!b) setTimeout(function () { $('#efT', r).focus(); }, 250);
  }

  // ---------------------------------------------------------------- ALBUM
  function vAlbum() {
    var st = F.st, cur = st.album.sets.filter(function (s) { return s.key === st.album.current; })[0];
    var have = cur.stickers.filter(function (s) { return cur.owned[s]; }).length;
    var h = '<section class="fl-set"><div class="top"><h3>' + cur.emoji + ' ' + esc(cur.name) + '</h3><b>' + have + '/' + cur.stickers.length + '</b></div>' +
      '<div class="prog"><span style="width:' + (have / cur.stickers.length * 100) + '%"></span></div><p>' + (have < cur.stickers.length ? 'Noch ' + (cur.stickers.length - have) + ' bis das Set komplett ist (+100 🪙)' : 'Set komplett! 🎉') + '</p></section>';
    h += '<div class="fl-grid">' + cur.stickers.map(function (s, i) {
      var r = cur.owned[s];
      return r ? '<div class="fl-slot have ' + (r === 'normal' ? '' : r) + '" style="transform:rotate(' + (i % 2 ? 3 : -4) + 'deg)" title="' + RAR[r] + '">' + esc(s) + '</div>' : '<div class="fl-slot empty">?</div>';
    }).join('') + '</div><p class="fl-note">Jeder geschaffte Block gibt einen Sticker – Pausen auch. Glänzend und Glitzer sind selten. Das Set wechselt mit der Jahreszeit.</p>';
    h += '<div class="fl-sec">Andere Sets</div><div class="fl-sets">' + st.album.sets.filter(function (s) { return s.key !== cur.key; }).map(function (s) {
      var n = s.stickers.filter(function (x) { return s.owned[x]; }).length;
      return '<div class="fl-lk"><b>' + s.emoji + '</b>' + esc(s.name) + '<br><small>' + n + '/' + s.stickers.length + '</small></div>';
    }).join('') + '</div>';
    var un = st.achievements.filter(function (a) { return a.unlockedAt; }).length;
    h += '<div class="fl-sec">Erfolge · ' + un + ' von ' + st.achievements.length + '</div><div class="fl-ach">' + st.achievements.map(function (a) {
      return '<div class="fl-a ' + a.rarity + (a.unlockedAt ? ' on' : '') + '"><span class="e">' + esc(a.emoji) + '</span><b>' + esc(a.title) + '</b><small>' + esc(a.text) + '</small><i>' + RAR_ACH[a.rarity] + '</i></div>';
    }).join('') + '</div>';
    return h;
  }
  function bindAlbum() { /* nur Anzeige */ }

  function levelSheet() {
    var st = F.st, lv = st.level;
    var h = FW.sheetHead(lv.emoji + ' Level ' + lv.level + ': ' + lv.title) + '<div class="sh-b"><p>' + (lv.next ? 'Noch ' + (lv.next - st.lifetime) + ' Münzen bis Level ' + (lv.level + 1) + '.' : 'Höchstes Level erreicht! 💫') +
      ' Level zählen alle je verdienten Münzen – Belohnungen einlösen kostet dich kein Level.</p><div class="fl-levels">' +
      [['✨', 'Funke', 0], ['🕯️', 'Flämmchen', 50], ['🔥', 'Lagerfeuer', 150], ['🌅', 'Sonnenaufgang', 300], ['🌈', 'Regenbogen', 500], ['🌌', 'Polarlicht', 800], ['🌠', 'Sternschnuppe', 1200], ['☄️', 'Komet', 1700], ['🪐', 'Galaxie', 2300], ['💫', 'Supernova', 3000]].map(function (l, i) {
        return '<div class="' + (i + 1 <= lv.level ? 'on' : '') + '"><span>' + l[0] + '</span>' + (i + 1) + ' · ' + l[1] + '<small>' + l[2] + ' 🪙</small></div>';
      }).join('') + '</div></div>';
    FW.openSheet(h);
  }

  // ---------------------------------------------------------------- ABEND
  function vAbend() {
    var st = F.st, done = st.day.blocks.filter(function (b) { return b.status === 'done'; });
    var moved = st.day.blocks.filter(function (b) { return b.status === 'moved'; });
    var h = '<section class="fl-eve"><span class="fl-eyebrow">' + (st.day.closed ? 'Tag abgeschlossen' : 'Dein Tag bis jetzt') + '</span><h2>' + (st.day.closed ? 'Schön war’s 🌙' : 'Das hast du geschafft') + '</h2>' +
      '<div class="fl-chest" id="flChest">' + (st.day.closed ? '🎉' : '🎁') + '</div>' +
      '<div class="fl-stats"><div><b>' + done.length + '</b><span>Blöcke</span></div><div><b>' + (st.day.stars ? new Array(st.day.stars + 1).join('⭐') : '–') + '</b><span>Sterne</span></div><div><b>🔥 ' + st.streak.current + '</b><span>Tage-Serie</span></div><div><b>' + st.day.earned + '</b><span>🪙 heute</span></div></div>' +
      (st.day.closed ? '<p class="fl-closing">' + esc(st.day.closing || '') + '</p>' : '<button class="fl-main-btn" id="flClose">Tag abschließen & Truhe öffnen</button>') +
      '<p class="fl-note">🛡️ ' + (st.streak.shieldAvailable ? '1 Joker diesen Monat – ein schwieriger Tag bricht deine Serie nicht.' : 'Joker für diesen Monat schon eingesetzt.') + '</p></section>';
    if (done.length) h += '<div class="fl-sec">Das lief gut</div><div class="fl-wins">' + done.map(function (b) { return '<div class="fl-win"><span>' + esc(b.emoji) + '</span>' + esc(b.title) + '<span class="s ' + (b.rarity || '') + '">' + esc(b.sticker || '✓') + '</span></div>'; }).join('') + '</div>';
    else h += '<p class="fl-note">Noch nichts abgehakt – das ist okay. Ein einziger kleiner Block reicht für den ersten Stern.</p>';
    if (moved.length) h += '<div class="fl-tmr">🌤️ Für morgen gemerkt: ' + moved.map(function (b) { return esc(b.emoji + ' ' + b.title); }).join(', ') + '. Das reicht völlig.</div>';
    h += '<div class="fl-sec">Belohnungen – selbst ausgesucht</div><div class="fl-rewards">' + st.rewards.map(function (r) {
      return '<div class="fl-rew"><span class="ic">' + esc(r.emoji) + '</span><div><b>' + esc(r.title) + '</b><div class="p"><span style="width:' + Math.min(st.coins / r.cost, 1) * 100 + '%"></span></div></div>' +
        '<button data-redeem="' + r.id + '"' + (st.coins < r.cost ? ' disabled' : '') + '>🪙 ' + r.cost + '</button><button class="x" data-rdel="' + r.id + '" aria-label="Entfernen">×</button></div>';
    }).join('') + '</div><form class="row-p fl-addrew" id="flRewF"><input class="input emoji" id="rwE" value="🎁" aria-label="Symbol"><input class="input name" id="rwT" placeholder="z. B. Kino mit Freundin"><input class="input" id="rwC" type="number" min="5" max="5000" value="100" style="width:90px" aria-label="Münzen"><button class="btn small" type="submit">＋</button></form>';
    if (st.redeemed.length) h += '<p class="fl-note">Zuletzt gegönnt: ' + st.redeemed.slice(-3).reverse().map(function (r) { return esc(r.emoji + ' ' + r.title); }).join(', ') + '</p>';
    // Einstellungen
    var p = person();
    h += '<div class="fl-sec">Einstellungen</div><div class="card set-sec">' +
      '<div class="row-p"><label>Feierabend um <input type="time" id="fsEnd" class="input" style="width:auto;min-height:0;padding:6px 8px" value="' + esc(st.settings.dayEnd || '21:00') + '"></label></div>' +
      '<label class="switch"><input type="checkbox" id="fsAuto"' + (st.settings.autoNext !== false ? ' checked' : '') + '> Nach „Fertig“ startet der nächste Block automatisch</label>' +
      '<label class="switch"><input type="checkbox" id="fsRem"' + (st.settings.remind !== false ? ' checked' : '') + '> Erinnerungen aufs Handy (ntfy)</label>' +
      '<div class="field"><span class="label">Mein ntfy-Thema</span><input class="input" id="fsTopic" value="' + esc(p.ntfyTopic || '') + '" placeholder="z. B. fluss-' + esc(p.name.toLowerCase().replace(/[^a-z]/g, '')) + '-' + Math.random().toString(36).slice(2, 8) + '"></div>' +
      '<p class="hint">App „ntfy“ installieren und dieses Thema abonnieren. Dann kommt 10 Min vor Ende jedes Blocks und vor Terminen eine sanfte Erinnerung.</p>' +
      '<div class="row-p"><label>Guten-Morgen-Gruß um <input type="time" id="fsMorning" class="input" style="width:auto;min-height:0;padding:6px 8px" value="' + esc(st.settings.morningAt || '') + '"></label></div>' +
      '<div class="row-p"><button class="btn primary small" id="fsSave">Speichern</button><button class="btn small" id="fsTest">Test-Nachricht</button><a class="btn small" href="/">Familien-Ansicht</a><button class="btn small" id="fsWho">Person wechseln</button></div></div>';
    return h;
  }
  function bindAbend(root) {
    var c = $('#flClose', root);
    if (c) c.onclick = function () {
      var chest = $('#flChest', root); chest.classList.add('shake');
      setTimeout(function () {
        act('/close', {}, { noDraw: true }).then(function (j) {
          if (!j) return;
          var r = j.reward, pt = center(chest);
          burst(pt.x, pt.y, 200); beep('big'); coinFly(chest, r.coins);
          setTimeout(function () {
            draw();
            FW.openSheet('<div class="fl-reveal"><span class="fl-eyebrow">Truhe geöffnet</span><div class="fl-flip open"><div class="in"><div class="face back">?</div><div class="face front ' + r.rarity + '">' + esc(r.sticker) + '</div></div></div>' +
              '<span class="fl-rar ' + r.rarity + '">' + RAR[r.rarity] + '</span><div class="fl-rw">+' + r.coins + ' 🪙</div><p class="fl-closing">' + esc(r.closing) + '</p><button class="fl-main-btn" data-close>Gute Nacht 🌙</button></div>');
          }, reduced ? 0 : 700);
        });
      }, reduced ? 0 : 1400);
    };
    $$('[data-redeem]', root).forEach(function (el) {
      el.onclick = function () {
        var pt = center(el);
        api('POST', '/rewards/' + el.getAttribute('data-redeem') + '/redeem?date=' + F.date).then(function (j) {
          F.st = j.state; draw(); burst(pt.x, pt.y, 90); beep('big'); FW.toast('Eingelöst – genieß es! 🎉');
          if (j.achievements && j.achievements.length) showAchievements(j.achievements);
        }, function (e) { FW.toast(e.message); });
      };
    });
    $$('[data-rdel]', root).forEach(function (el) {
      el.onclick = function () {
        if (!el.getAttribute('data-sure')) { el.setAttribute('data-sure', '1'); el.textContent = '?'; el.className = 'x sure'; return; }
        api('DELETE', '/rewards/' + el.getAttribute('data-rdel') + '?date=' + F.date).then(function (j) { F.st = j.state; draw(); });
      };
    });
    $('#flRewF', root).onsubmit = function (e) {
      e.preventDefault();
      act('/rewards', { emoji: $('#rwE', root).value, title: $('#rwT', root).value, cost: +$('#rwC', root).value }).then(function (j) { if (j) FW.toast('Belohnung hinzugefügt ✓'); });
    };
    function saveSettings() {
      return api('PUT', '/settings?date=' + F.date, { dayEnd: $('#fsEnd', root).value, autoNext: $('#fsAuto', root).checked, remind: $('#fsRem', root).checked, ntfyTopic: $('#fsTopic', root).value || $('#fsTopic', root).placeholder, morningAt: $('#fsMorning', root).value })
        .then(function (j) { F.st = j.state; return FW.api('GET', '/api/bootstrap'); }).then(function (b) { FW.state().boot = b; draw(); return true; });
    }
    $('#fsSave', root).onclick = function () { saveSettings().then(function () { FW.toast('Gespeichert ✓'); }, function (e) { FW.toast(e.message); }); };
    $('#fsTest', root).onclick = function () {
      saveSettings().then(function () { return api('POST', '/test-ntfy?date=' + F.date, {}); }).then(function () { FW.toast('Test gesendet – schau in die ntfy-App'); }, function (e) { FW.toast(e.message); });
    };
    $('#fsWho', root).onclick = function () { FW.store('fw.flussPerson', null); F.pid = null; F.st = null; draw(); };
  }

  // ---------------------------------------------------------------- Takt
  function tick() {
    if (!F.st || F.st.date !== todayYmd() || !FW.state().boot) return;
    var pl = planFor(F.st.date), cur = pl.current, now = Date.now();
    // Blöcke mit fester Startzeit starten von selbst, wenn nichts läuft
    if (cur && cur.type === 'block' && cur.anchored && now >= cur.s && !F.busy) {
      var running = F.st.day.blocks.some(function (b) { return b.status === 'now'; });
      if (!running && !F.notified['auto' + cur.b.id]) { F.notified['auto' + cur.b.id] = 1; act('/blocks/' + cur.b.id + '/start').then(function () { banner('Jetzt: ' + cur.b.emoji + ' ' + cur.b.title + '. ' + (cur.b.note || 'Du liegst gut in der Zeit.')); }); return; }
    }
    if (cur && cur.type === 'block' && cur.state === 'now') {
      var rem = cur.e - now, total = (cur.b.dur + (cur.b.ext || 0)) * 60000, k = cur.b.id + '_' + (cur.b.ext || 0);
      var nx = pl.next, nxName = nx ? (nx.b ? nx.b.emoji + ' ' + nx.b.title : '📅 ' + nx.rock.title) : null;
      if (rem <= 600000 && rem > 0 && !F.notified['w' + k]) { F.notified['w' + k] = 1; banner(nxName ? 'In 10 Min kommt ' + nxName + '. Such dir schon mal einen guten Abschluss.' : 'Noch 10 Minuten. Du machst das super.'); }
      if (rem <= 0 && !F.notified['e' + k]) { F.notified['e' + k] = 1; banner('Zeit ist um ✨ Tipp auf „Fertig“ und hol dir deinen Sticker 🎁'); }
      if (F.tab === 'jetzt') {
        var arc = $('#flArc');
        if (arc) {
          arc.setAttribute('stroke-dashoffset', 653.5 * (1 - Math.max(rem, 0) / total));
          $('#flRem').textContent = remTxt(rem);
          $('#flRemSub').textContent = rem <= 0 ? 'Zeit ist um' : 'noch · bis ' + hmMs(cur.e) + ' Uhr';
          $('#flRing').classList.toggle('over', rem <= 0);
          $('#flOver').hidden = rem > 0;
        }
        var bf = $('#flBuf'); if (bf && pl.buffer) bf.textContent = bufTxt(pl.buffer.min);
      }
    }
    // Termine 10 Minuten vorher
    pl.items.forEach(function (it) {
      if (it.type !== 'rock' || it.state !== 'todo') return;
      var until = it.s - now;
      if (until <= 600000 && until > 0 && !F.notified['r' + it.rock.id]) { F.notified['r' + it.rock.id] = 1; banner('In ' + Math.round(until / 60000) + ' Min: 📅 ' + it.rock.title + '. Du liegst gut in der Zeit.'); }
    });
  }

  window.FWFluss = {
    init: function () {
      FW = window.FW;
      F.pid = FW.store('fw.flussPerson');
      F.sound = FW.store('fw.sound') !== '0';
      F.date = todayYmd();
      setInterval(tick, 1000);
      setInterval(function () { if (F.tab !== 'jetzt' || !F.st) return; if (!document.querySelector('.overlay.show')) draw(); }, 60000);
      document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && F.pid) { F.date = F.tab === 'tag' ? F.date : todayYmd(); load(); } });
    },
    render: function () {
      FW = FW || window.FW;
      if (document.querySelector('.overlay.show') && F.st) return; // nicht unter offenen Fenstern neu zeichnen
      draw();
    },
    reload: function () { return load(); },
  };
})();
