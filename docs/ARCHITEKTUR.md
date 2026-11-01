# Vorschlag: Zwei Apps, ein System

```
                    ┌──────────────────────────── Heimserver (Docker, z. B. Pi/NUC/NAS) ───────────────────────────┐
 Google Kalender ◄──┤                                                                                              │
 (Familie, Kind,    │   ① FAMILIEN-HUB  (Kinboard)               ② TAGESBEGLEITER  (eigene PWA, Basis: momo-Fork)  │
  Eltern)           │   • Wochen-/Tageskalender                   • Zeitstrahl „Mein Tag“ mit Zeitpuffer          │
                    │   • Einkaufsliste (+ eigene Einkaufs-PWA)    • Blöcke: 1h Aufräumen → 30min Pause → Kochen   │
 Hausautomatik  ◄───┤   • Aufgaben pro Tag, Kinder-Kreatur         • Erinnerungen, Übergangs-Warnungen (Push)     │
 (Home Assistant?)  │   • Essensplan, Stundenplan Kind             • Sticker, Konfetti, Combos, Level-Karte       │
                    │                ▲  REST-API / ICS  ───────────────►  liest Termine & Familienaufgaben        │
                    └────────────────┼──────────────────────────────────────────────┼───────────────────────────────┘
                                     │ LAN                                           │ LAN / VPN (Tailscale) / HTTPS
                  Alte Tablets an der Wand (Kiosk)                    Handy der Frau (installiert als App, Push)
                  Handys aller (PWA „Einkauf“)                         + Widget/Startbildschirm
```

## Warum zwei Apps?

1. **Unterschiedliche Nutzer & Stimmungen.** Die Wand ist für *alle* (ruhig, Überblick, Kind).
   Der Tagesbegleiter ist *persönlich* (fokussiert, verspielt, eine Sache zur Zeit). In einer App
   würde das eine das andere verwässern.
2. **Den Familien-Teil gibt es fertig und gut** (Kinboard: Google-Sync, Einkauf, Kiosk, Deutsch).
   Selbst bauen wäre Monate Arbeit ohne Mehrwert.
3. **Den ADHS-Teil gibt es so nicht** → hier lohnt sich die Eigenentwicklung, und genau dort steckt
   die UI-Liebe.
4. Beide reden über APIs miteinander; für die Familie fühlt es sich wie *ein* System an.

## ① Familien-Hub: Kinboard

- Installation per Docker (`install.sh`), danach Join-Code auf jedem Tablet/Handy eingeben.
- Google Kalender verbinden: je ein Kalender pro Person (Mama, Papa, Kind) → farbige Wochenübersicht.
- Kind: „Kreatur“ schlüpft aus dem Ei und wächst mit erledigten Aufgaben; später Stundenplan + Packliste.
- Einkauf: separate Einkaufs-PWA unter `/einkaufen` aufs Handy legen.
- Alternative falls Kinboard nicht gefällt: **Prism** (gleiche Klasse) oder **Familienhub** (deutsch, AGPL, echte Android-App).

## ② Tagesbegleiter (Arbeitsname „Tagesfluss“)

**Basis:** Fork von [jp1337/momo](https://github.com/jp1337/momo) (MIT, Next.js 16, Postgres, PWA,
Web-Push/ntfy, Deutsch, Münzen/Streaks/Level schon vorhanden). Wir ergänzen den fehlenden Kern:

### Kernfunktionen (MVP)

1. **„Jetzt“-Bildschirm** – eine große Karte: *„Jetzt: Aufräumen 🧹 – noch 42 Min“* mit Ring-Timer
   (Time-Timer-Stil, Farbe läuft ab). Darunter klein: *„Danach: Pause ☕ 30 Min“*.
2. **Zeitstrahl des Tages** – vertikaler Pfad wie eine Level-Karte. Feste Termine aus Google Kalender
   als „Felsen“, flexible Blöcke dazwischen. **Puffer-Anzeige**: *„Bis zum Abholen um 16:00 hast du noch
   2 h 15 min – geplant sind 1 h 30 → 45 min Luft 😌“* (grün = entspannt, gelb = knapp, nie rot-alarmierend).
3. **Blöcke statt Aufgaben** – Vorlagen wie „Aufräumen 60“, „Pause 30“, „Kochen 45“, per Drag&Drop
   in den Tag ziehen. Routinen (Morgen/Abend) als fertige Ketten.
4. **Rückwärtsplanung** – *„Essen soll um 18:30 fertig sein“* → App rechnet: *„Um 17:45 mit Kochen anfangen“*
   und erinnert rechtzeitig.
5. **Erinnerungen mit Übergang** – 10 min vorher: *„Gleich ist Pause 🎉 – such dir schon mal einen Abschluss“*;
   zum Start: *„Los geht's: Kochen 🍝 (du hast genug Zeit)“*. Kanäle: Web-Push (Android & iOS-PWA) oder ntfy.
6. **Nicht geschafft? Kein Drama** – „Verschieben“ schiebt den Rest des Tages automatisch nach und zeigt
   sofort neu, ob es noch passt. Keine roten Überfällig-Listen.

### Spiel-Ebene

- **Sticker-Album**: jeder abgeschlossene Block = Sticker (Tiere, Essen, Glitzer-Seltenheiten).
  Sets komplettieren gibt Bonus. Wöchentliches Themen-Set (z. B. „Herbst“).
- **Saftiges Feedback**: Konfetti/Partikel, kurze Sounds, Vibration, Münzen fliegen ins Konto
  (Bibliotheken: `canvas-confetti`, `framer-motion`/`motion`, `lottie`, `howler.js`).
- **Combos**: drei Blöcke in Folge pünktlich gestartet → x2 Münzen, Combo-Anzeige wie in Match-3-Spielen.
- **Tageslevel & Sterne**: 1–3 Sterne für den Tag (schon *ein* erledigter Block = 1 Stern).
- **Truhe am Abend**: „Geschafft für heute“-Bildschirm mit Rückblick (was alles geklappt hat) + Überraschung.
- **Joker**: Streak-Schutz pro Woche, damit ein schlechter Tag nichts kaputt macht.
- **Belohnungen in echt**: Münzen gegen selbst festgelegte Belohnungen eintauschen (momo-Wunschliste).

### UI-Prinzipien

- Große Schrift, maximal **eine** Entscheidung pro Bildschirm, Daumen-erreichbar.
- Warme, freundliche Farben, runde Formen, Emoji/Illustrationen; Dunkelmodus.
- Sprache immer lobend und entlastend: *„Super gemacht!“*, *„Alles im grünen Bereich“*, *„Pause verdient“*.
- Zeit wird **gezeigt, nicht gerechnet** (Balken/Ringe statt nur Uhrzeiten).

## Zugriff von unterwegs

- Beide Apps als **PWA** („Zum Startbildschirm hinzufügen“) → wirkt wie eine App, inkl. Push.
- Von außen: **Tailscale** (einfachstes VPN, nichts öffentlich) oder Reverse-Proxy
  (Caddy/Nginx Proxy Manager) mit HTTPS. Für iOS-Push ist HTTPS Pflicht.

## Fahrplan

1. Heimserver + Docker einrichten, **Kinboard** installieren, Google-Kalender & Tablets verbinden.
2. **momo** forken und lokal starten, deutsche Oberfläche testen.
3. Klickbarer UI-Prototyp „Jetzt“ + „Zeitstrahl“ + Sticker – **gemeinsam mit deiner Frau testen**, bevor gebaut wird.
4. MVP Tagesbegleiter: Zeitstrahl, Blöcke, Puffer-Rechnung, Push-Erinnerungen, Google-Kalender (nur lesen).
5. Spiel-Ebene: Sticker-Album, Combos, Abend-Truhe.
6. Verknüpfung: Familienaufgaben aus Kinboard erscheinen im Tagesplan; Hausautomatik-Trigger (optional).
