# Recherche: Open-Source-Projekte für Familien-Organisation & ADHS-Tagesstruktur

Stand: 01.11.2026. Alle Repos wurden geklont und auf README, Lizenz, Stack und Funktionen geprüft.
Klonen: `scripts/clone-references.sh` (legt alles unter `vendor/` ab, nicht im Git).

> **Lizenz-Hinweis:** *PolyForm Noncommercial* = private Nutzung in der Familie erlaubt, kommerziell nicht.
> *AGPL* = frei nutzbar; wer es verändert **und** öffentlich anbietet, muss den Code teilen (privat egal).
> *MIT/Apache* = alles erlaubt, ideal zum Forken.

## 1. Familien-Dashboard (Wand-Tablets, Kalender, Einkauf, Aufgaben)

| Projekt | ★ | Stack | Lizenz | Google-Kalender | Einkauf | Aufgaben/Kinder | Deutsch | Bewertung |
|---|---|---|---|---|---|---|---|---|
| **[svenger87/kinboard](https://github.com/svenger87/kinboard)** | 21 | Next.js, Docker | PolyForm NC | ✅ 2-Wege-Sync | ✅ eigene Einkaufs-PWA, Bring!-Sync | ✅ Aufgaben, Punkte, Kreaturen die mitwachsen, Belohnungen, Taschengeld, Stundenplan | ✅ DE/EN/FR | **Favorit.** Deutscher Entwickler, sehr aktiv, Kiosk-Modus, Web-Push, Home-Assistant-Integration, Join-Code für alte Tablets/Handys |
| [sandydargoport/prism](https://github.com/sandydargoport/prism) | 130 | Next.js, Postgres | PolyForm NC | ✅ | ✅ | ✅ Chores mit Punkten & Freigabe | ✅ teilweise | Sehr ausgereift, sehr aktiv, HA-Add-on. Etwas US-lastig (Kroger, Alexa) |
| [Brottuetchen/familienhub](https://github.com/Brottuetchen/familienhub) | 0 | FastAPI + Flutter | AGPL | ⚠️ nur CalDAV/ICS | ✅ (+Mealie/Cookidoo) | ✅ Kindermodus mit Sternen, Habitica-Plugin | ✅ DE nativ | Sehr gute Feature-Liste, echte Android-App mit Widgets – aber brandneu (Okt. 2026), kein direkter Google-Sync |
| [jherforth/HomeGlow](https://github.com/jherforth/HomeGlow) | 76 | React + Node | AGPL | ⚠️ ICS/CalDAV | – | ✅ „Clams“-Belohnungen, Swipe-to-Complete | – | Hübsche Widgets, frei anordnen |
| [caspii/dinkydash](https://github.com/caspii/dinkydash) | 99 | Python/Flask | MIT | ⚠️ ICS | – | einfach | – | **Leichtgewicht** – Fallback für sehr alte Tablets |
| [MagicMirrorOrg/MagicMirror](https://github.com/MagicMirrorOrg/MagicMirror) | 24k | Node | MIT | ✅ via Module | via Module | via Module | ✅ | Riesige Community, aber eher Anzeige als Interaktion |
| [FamousWolf/week-planner-card](https://github.com/FamousWolf/week-planner-card) | 527 | HA Lovelace | MIT | ✅ via HA | – | – | ✅ | Falls die Hausautomatik Home Assistant ist: schöne Wochenübersicht direkt in HA |

**Einkauf / Essen (optional, falls mehr als eine Liste gebraucht wird):**
[TomBursch/kitchenowl](https://github.com/TomBursch/kitchenowl) (3.8k★, Flutter-Apps, AGPL),
[mealie-recipes/mealie](https://github.com/mealie-recipes/mealie) (13.7k★, Rezepte + Wochenplan),
[grocy/grocy](https://github.com/grocy/grocy) (9.6k★, Vorratshaltung).

**Aufgaben / Haushalt (optional):**
[donetick/donetick](https://github.com/donetick/donetick) (2.7k★, Go, AGPL – rotierende Haushaltsaufgaben, HA-Integration).

## 2. ADHS-Tagesstruktur & Gamification

| Projekt | ★ | Stack | Lizenz | Was es gut macht | Was fehlt |
|---|---|---|---|---|---|
| **[jp1337/momo](https://github.com/jp1337/momo)** | 11 | Next.js 16, Postgres, PWA | **MIT** | Daily Quest (1 Aufgabe), Energie-Check-in, Münzen/Streaks/Level, Streak-Schutz, Zeitschätzung, Fokus- & 5-Min-Modus, Web-Push/ntfy, Morgen-Briefing, Deutsch, REST-API, Docker | **Kein Zeitstrahl / Tagesplan**, keine „wie viel Zeit habe ich noch“-Ansicht, kein Kalender-Import, Animationen eher ruhig |
| [kks0488/dailywave](https://github.com/kks0488/dailywave) | 17 | React + FastAPI | Apache-2.0 | „Ein klarer nächster Schritt“, Routinen + Flows, „Victory Wall“ ohne Scham, Chaos-Inbox | Kaum Gamification, kein Push |
| [dohsimpson/HabitTrove](https://github.com/dohsimpson/HabitTrove) | 693 | Next.js | AGPL | Gamifizierter Habit-Tracker mit Belohnungs-Shop | Keine Tagesstruktur |
| [HabitRPG/habitica](https://github.com/HabitRPG/habitica) | 14k | Node | GPL/CPAL | Das Original der Aufgaben-Gamification (RPG) | Komplex, Strafen-Mechanik (HP-Verlust) ist für ADHS oft kontraproduktiv |
| [super-productivity/super-productivity](https://github.com/super-productivity/super-productivity) | 23k | Angular | MIT | Timeboxing, Zeit-Tracking, Pomodoro, Kalender-Import | Wirkt wie ein Arbeitstool, nicht motivierend/verspielt |
| [thatsjet/nudge-app](https://github.com/thatsjet/nudge-app) | 24 | TS Desktop | MIT | ADHS-Ideen & Tagesplanung | Nur Desktop |

**Fazit:** Es gibt **kein** Projekt, das Zeitstrahl + Zeitpuffer-Anzeige + Erinnerungen + verspielte
„Candy-Crush“-Belohnungen kombiniert. Die besten Bausteine sind **momo** (MIT, Gamification, Push, Deutsch)
und die Ideen aus **dailywave** („nur der nächste Schritt“). Den Tagesplan-Teil müssen wir selbst bauen.

## 3. Was aus Spielen wie Candy Crush hilft (und was nicht)

Nützlich für ADHS (Dopamin-Feedback, Struktur):
- **Sofortiges, „saftiges“ Feedback**: Konfetti, Sound, Vibration, Zahlen die hochzählen – bei *jedem* Abhaken.
- **Level-Karte / Weg**: Der Tag als Pfad mit Stationen (Aufräumen → Pause → Kochen) – man sieht, wie weit man ist.
- **Combos**: Mehrere Blöcke pünktlich hintereinander = Multiplikator.
- **Variable Belohnungen**: Überraschungs-Sticker, Truhen nach X Blöcken, seltene Glitzer-Sticker.
- **Sammelalbum**: Sticker-Sets komplettieren (wie Sammelkarten), Wochen-Event mit Spezial-Stickern.
- **Tagesbonus**: kleines Geschenk fürs Öffnen am Morgen.

Bewusst **vermeiden**:
- Strafen, verlorene Leben, rot blinkende „überfällig“-Listen → erzeugt Scham und Vermeidung.
- Streaks die bei einem Fehltag auf 0 fallen → Streak-Schutz/„Joker“ (momo hat das schon).
- Endlos-Loops ohne Ende → der Tag hat ein klares **„Geschafft für heute“**.

## 4. Zu den alten Tablets & Handys

- Moderne Web-Apps (Kinboard, Prism, momo) brauchen einen aktuellen Browser.
  Faustregel: **Android ≥ 7 mit aktualisierbarem Chrome/WebView** oder **iPad mit iOS ≥ 15** läuft gut.
- Empfohlen auf Android: **Fully Kiosk Browser** (Vollbild, Bildschirm-An/Aus per Zeitplan, Autostart).
- Sehr alte Geräte (Android 4–6, iOS ≤ 12): besser **DinkyDash** oder eine reine Anzeige-Seite
  (statisches HTML) – oder als digitaler Bilderrahmen/Uhr weiterverwenden.
