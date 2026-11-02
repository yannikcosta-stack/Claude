/* Versteht kurze deutsche Eingaben wie „Zahnarzt Mi 15 Uhr“ oder „Urlaub 20.12.-27.12.“.
   Klassisches Skript (läuft auch auf älteren Tablets) – stellt window.FWParse bereit. */
(function (root) {
  'use strict';
  var WD = { montag: 1, mo: 1, dienstag: 2, di: 2, mittwoch: 3, mi: 3, donnerstag: 4, do: 4, freitag: 5, fr: 5, samstag: 6, sa: 6, sonnabend: 6, sonntag: 0, so: 0 };
  var MON = { januar: 1, jan: 1, 'jänner': 1, februar: 2, feb: 2, 'märz': 3, maerz: 3, 'mär': 3, mrz: 3, april: 4, apr: 4, mai: 5, juni: 6, jun: 6, juli: 7, jul: 7, august: 8, aug: 8, september: 9, sept: 9, sep: 9, oktober: 10, okt: 10, november: 11, nov: 11, dezember: 12, dez: 12 };
  var B = '(^|[\\s,;(])';
  var E = '(?=$|[\\s,;!?)])';
  var MONRE = Object.keys(MON).sort(function (a, b) { return b.length - a.length; }).join('|');

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function mk(y, m, d) { var x = new Date(y, m - 1, d); return x.getMonth() === m - 1 && x.getDate() === d ? x : null; }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function resolve(d, m, y, today) {
    if (y) { y = +y; if (y < 100) y += 2000; return mk(y, +m, +d); }
    var x = mk(today.getFullYear(), +m, +d);
    if (x && x < today) x = mk(today.getFullYear() + 1, +m, +d);
    return x;
  }
  function hhmm(h, mi) { h = +h; mi = mi ? +mi : 0; if (h > 24 || mi > 59) return null; if (h === 24) h = 0; return pad(h) + ':' + pad(mi); }
  function minutes(t) { var p = t.split(':'); return +p[0] * 60 + +p[1]; }

  function parse(text, now) {
    now = now || new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var s = ' ' + String(text || '') + ' ';
    var r = { title: '', date: null, endDate: null, time: null, endTime: null, durationMin: null, allDay: null, people: [] };

    function take(re, fn) {
      var m = re.exec(s);
      if (!m) return false;
      var res = fn(m);
      if (res === false) return false;
      s = s.slice(0, m.index) + (m[1] || '') + ' ' + s.slice(m.index + m[0].length);
      return true;
    }

    // 1) Datumsbereich: 20.12.-27.12. | 20.-27.12. | vom 20.12. bis 27.12.2026
    take(new RegExp(B + '(?:vom\\s+)?(\\d{1,2})\\.(?:(\\d{1,2})\\.)?(\\d{2,4})?\\s*(?:-|–|bis)\\s*(\\d{1,2})\\.(\\d{1,2})\\.?(\\d{2,4})?' + E, 'i'), function (m) {
      var end = resolve(m[5], m[6], m[7], today);
      if (!end) return false;
      var start = resolve(m[2], m[3] || m[6], m[4] || m[7], today);
      if (!start) return false;
      if (start > end) start = mk(start.getFullYear() - 1, start.getMonth() + 1, start.getDate()) || start;
      r.date = ymd(start); r.endDate = ymd(end); r.allDay = true;
    });
    // 2) „12. November“, „am 3. Dez 2026“
    if (!r.date) take(new RegExp(B + '(?:am\\s+)?(\\d{1,2})\\.?\\s*(' + MONRE + ')\\.?(?:\\s+(\\d{4}))?' + E, 'i'), function (m) {
      var d = resolve(m[2], MON[m[3].toLowerCase()], m[4], today);
      if (!d) return false;
      r.date = ymd(d);
    });
    // 3) „12.11.“, „12.11.2026“, „am 12.11“ (nicht „10.15 Uhr“)
    if (!r.date) take(new RegExp(B + '(?:am\\s+)?(\\d{1,2})\\.(\\d{1,2})(?:\\.(\\d{2,4})?)?(?!\\s*uhr)' + E, 'i'), function (m) {
      var d = resolve(m[2], m[3], m[4], today);
      if (!d) return false;
      r.date = ymd(d);
    });
    // 4) heute / morgen / übermorgen
    if (!r.date) take(new RegExp(B + '(übermorgen|uebermorgen|morgen|heute)' + E, 'i'), function (m) {
      var w = m[2].toLowerCase();
      r.date = ymd(addDays(today, w === 'heute' ? 0 : w === 'morgen' ? 1 : 2));
    });
    // 5) Wochentag: „Mittwoch“, „am Fr“, „nächsten Montag“
    if (!r.date) take(new RegExp(B + '(?:(am|nächsten|nächste|naechsten|naechste|kommenden|kommende)\\s+)?(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonnabend|sonntag|mo|di|mi|do|fr|sa|so)(\\.?)' + E, 'i'), function (m) {
      var w = m[3].toLowerCase();
      if (w === 'so' && !m[2] && !m[4]) return false; // „so“ ist meist kein Sonntag
      var delta = (WD[w] - today.getDay() + 7) % 7;
      if (delta === 0 && m[2] && m[2].toLowerCase() !== 'am') delta = 7;
      r.date = ymd(addDays(today, delta));
    });

    // 6) Zeitspanne: „10-12 Uhr“, „von 9 bis 11:30“, „18:00–19:30“
    take(new RegExp(B + '(von\\s+|ab\\s+)?(\\d{1,2})(?:[:.](\\d{2}))?\\s*(?:uhr\\s*)?(?:-|–|bis)\\s*(\\d{1,2})(?:[:.](\\d{2}))?\\s*(uhr|h)?' + E, 'i'), function (m) {
      if (!(m[2] || m[4] || m[6] || m[7])) return false;
      var a = hhmm(m[3], m[4]), b = hhmm(m[5], m[6]);
      if (!a || !b) return false;
      r.time = a; r.endTime = b;
    });
    // 7) Einzelzeit: „um 15“, „15 Uhr“, „15:30“, „ab 9.30 Uhr“
    if (!r.time) take(new RegExp(B + '(?:um|ab|gegen)\\s+(\\d{1,2})(?:[:.](\\d{2}))?\\s*(?:uhr)?' + E, 'i'), function (m) {
      var t = hhmm(m[2], m[3]); if (!t) return false; r.time = t;
    });
    if (!r.time) take(new RegExp(B + '(\\d{1,2}):(\\d{2})\\s*(?:uhr)?' + E, 'i'), function (m) {
      var t = hhmm(m[2], m[3]); if (!t) return false; r.time = t;
    });
    if (!r.time) take(new RegExp(B + '(\\d{1,2})(?:[.](\\d{2}))?\\s*uhr' + E, 'i'), function (m) {
      var t = hhmm(m[2], m[3]); if (!t) return false; r.time = t;
    });
    // 8) Dauer: „für 2h“, „90 min“, „1,5 Stunden“, „eine Stunde“
    take(new RegExp(B + '(?:für\\s+|fuer\\s+)?(\\d+(?:[.,]\\d+)?)\\s*(h|std\\.?|stunden?|min\\.?|minuten)' + E, 'i'), function (m) {
      var n = parseFloat(m[2].replace(',', '.'));
      var unit = m[3].toLowerCase();
      r.durationMin = Math.round(unit.charAt(0) === 'm' ? n : n * 60);
      if (!r.durationMin) return false;
    });
    if (!r.durationMin) take(new RegExp(B + '(?:für\\s+|fuer\\s+)?(eine|halbe|anderthalb|zwei|drei)\\s+(stunden?)' + E, 'i'), function (m) {
      r.durationMin = { eine: 60, halbe: 30, anderthalb: 90, zwei: 120, drei: 180 }[m[2].toLowerCase()];
    });
    // 9) ganztägig
    take(new RegExp(B + '(ganztägig|ganztaegig|ganztags|den ganzen tag)' + E, 'i'), function () { r.allDay = true; });
    // 10) @Person (mehrfach möglich)
    var pm;
    var pre = /(^|\s)@([A-Za-zÄÖÜäöüß0-9_-]+)/;
    while ((pm = pre.exec(s))) {
      r.people.push(pm[2]);
      s = s.slice(0, pm.index) + pm[1] + s.slice(pm.index + pm[0].length);
    }

    // Ableitungen
    if (r.time) {
      r.allDay = false;
      if (r.endTime) {
        var d1 = minutes(r.endTime) - minutes(r.time);
        r.durationMin = d1 > 0 ? d1 : d1 + 1440;
      }
      if (!r.date) {
        var nowMin = now.getHours() * 60 + now.getMinutes();
        r.date = ymd(minutes(r.time) > nowMin ? today : addDays(today, 1));
        r.dateGuessed = true;
      }
    } else if (r.date && r.allDay === null) {
      r.allDay = true;
    }

    // Titel säubern
    var t = s.replace(/\s+/g, ' ').trim();
    var dangling = /^(am|um|von|vom|bis|für|fuer|ab|gegen|nächsten|nächste|kommenden)\s+|\s+(am|um|von|vom|bis|für|fuer|ab|gegen|nächsten|nächste|kommenden)$/i;
    for (var i = 0; i < 4; i++) t = t.replace(dangling, '').trim();
    t = t.replace(/^[-–,:;\s]+|[-–,:;\s]+$/g, '');
    r.title = t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
    return r;
  }

  var api = { parse: parse, ymd: ymd };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.FWParse = api;
})(typeof window !== 'undefined' ? window : globalThis);
