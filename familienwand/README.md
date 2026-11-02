# Familienwand

Euer gemeinsamer Familienkalender – **lokal auf dem NAS**, verbunden mit **Google Kalender**,
als **App auf Android und iPhone** und als **Family Wall** auf alten Tablets.

- 📱 **Handy:** Termine in Sekunden eintragen – einfach „Zahnarzt Mi 15 Uhr“ tippen, die App versteht Datum, Uhrzeit, Dauer und `@Person`.
- 🖼️ **Tablet:** `/wall` öffnen → Uhr, Wetter, „Heute“-Liste und 7-Tage-Wochenplan mit Farben pro Person. Aktualisiert sich sofort, wenn jemand am Handy etwas einträgt.
- 🔄 **Google Kalender:** Lesen und Schreiben (zwei Richtungen). Dazu iCal-Abos (Kita, Schule, Müllabfuhr, Feiertage) zum Mitlesen.
- 🔔 **Erinnerungen** aufs Handy über die App *ntfy* – plus Morgen-Übersicht „Heute: 3 Termine“.
- 🧒 **Fürs Kind vorbereitet:** eigene Farbe und Emoji, eigene Spalte in der Legende, eigener Kalender möglich.
- 🔒 Familien-Passwort, Daten bleiben bei euch. Keine Cloud, kein Abo, keine npm-Abhängigkeiten.

| Handy | Family Wall (quer) | Family Wall (hochkant) |
|---|---|---|
| Agenda mit Tagesleiste und Personenfilter | Uhr, Heute-Liste, Wochenplan | Woche als Zeilen |

---

## 1. Auf dem NAS starten (Docker)

Voraussetzung: Docker bzw. *Container Manager* (Synology), *Container Station* (QNAP) oder Portainer.

```bash
# Ordner aufs NAS kopieren, dann darin:
docker compose up -d --build
```

In `docker-compose.yml` vorher **`APP_PASSWORD`** ändern. Danach im Browser: `http://<NAS-IP>:8080`

- Alle Daten liegen in `./data` (Termine, Einstellungen, Google-Schlüssel) → **diesen Ordner ins NAS-Backup aufnehmen.**
- Der Container startet kurz als root, übergibt `data` an den Benutzer `node` (UID 1000) und läuft dann ohne root-Rechte. Andere UID: `PUID`/`PGID` setzen.
- Läuft auf x86 und ARM (Synology, QNAP, Raspberry Pi).

**Synology ohne Kommandozeile:** Container Manager → *Projekt* → *Erstellen* → Ordner wählen → `docker-compose.yml` wird erkannt → *Erstellen*.

## 2. Google Kalender verbinden (einmalig, ca. 10 Minuten)

Die Familienwand nutzt ein **Google-Dienstkonto** statt eines Login-Fensters. Das hat zwei Vorteile:
Es funktioniert mit jeder NAS-Adresse (Google erlaubt OAuth-Logins sonst nur über `localhost` oder eine echte Domain),
und es läuft nicht nach 7 Tagen ab, wie es bei privaten OAuth-Apps im Testmodus passiert.

1. <https://console.cloud.google.com> öffnen → neues Projekt „Familienwand“.
2. *APIs & Dienste → Bibliothek* → **Google Calendar API** → *Aktivieren*.
3. *IAM & Verwaltung → Dienstkonten* → **Dienstkonto erstellen** (Name egal, keine Rollen nötig).
4. Dienstkonto öffnen → *Schlüssel* → *Schlüssel hinzufügen* → *Neuen Schlüssel erstellen* → **JSON**.
5. In der Familienwand: ⚙️ Einstellungen → *Google verbinden* → JSON-Datei hochladen.
6. Die angezeigte Adresse (`…@….iam.gserviceaccount.com`) kopieren.
7. In Google Kalender (am Computer) für **jeden** Kalender: ⋮ → *Einstellungen und Freigabe* → *Für bestimmte Personen freigeben* → Adresse einfügen → **„Änderungen an Terminen vornehmen“**.
8. Dort weiter unten unter *Kalender integrieren* die **Kalender-ID** kopieren
   (beim Hauptkalender ist das eure Gmail-Adresse) → in der Familienwand *Kalender hinzufügen → Google* einfügen.

Tipp: Legt in Google einen gemeinsamen Kalender **„Familie“** an und macht ihn in der Familienwand zum *Standard für neue Termine*.
Eure persönlichen Kalender könnt ihr zusätzlich hinzufügen und jeweils einer Person zuordnen – dann bekommen sie automatisch deren Farbe.

**Wer gehört zu welchem Termin?** (Idee aus Kinboard)
1. In der App gewählt (wird unsichtbar im Google-Termin gespeichert und wandert mit),
2. sonst: Kalender gehört einer Person,
3. sonst Titel-Regel: `Mama: Yoga`, `Yoga (Mama)` oder `@Mama`,
4. sonst: ganze Familie.

**Nur mitlesen:** Für Kita-, Schul-, Vereins- oder Müllkalender den iCal-Link unter *Kalender hinzufügen → iCal-Link* eintragen.
Mit *Art: Müllabfuhr* erscheinen die Abholtage nicht im Wochenplan, sondern oben auf der Wand als „🗑️ Morgen: Gelber Sack“.
Mit *Art: Feiertage/Ferien* werden sie als 🎉 markiert.

## 3. Aufs Handy (Android & iPhone)

- **iPhone:** Safari → Adresse öffnen → Teilen-Symbol → **„Zum Home-Bildschirm“**.
- **Android:** Chrome → Adresse öffnen → ⋮ → **„App installieren“** bzw. *Zum Startbildschirm hinzufügen*.
- Lange auf das App-Symbol drücken → *Neuer Termin* (Android).

### Von unterwegs (empfohlen: Tailscale)

Damit es auch außerhalb des WLANs geht, ohne etwas ins Internet zu öffnen:

1. [Tailscale](https://tailscale.com) auf dem NAS (Synology-Paket vorhanden) und auf allen Handys installieren, gleiches Konto.
2. Auf dem NAS: `tailscale serve --bg 8080`
3. Ihr bekommt eine Adresse wie `https://nas.tailnet-name.ts.net` **mit echtem HTTPS-Zertifikat**.

Mit **HTTPS** wird die Familienwand eine vollwertige App mit Offline-Modus (der letzte Stand bleibt sichtbar).
Über `http://192.168.x.x` geht alles auch, nur ohne Offline-Modus.

Alternativ: Reverse-Proxy des NAS (Synology: *Anmeldeportal → Reverse Proxy*) mit Let's-Encrypt-Zertifikat.
Dann unbedingt ein starkes `APP_PASSWORD` setzen.

## 4. Family Wall auf dem Tablet

1. Auf dem Tablet `http://<NAS-IP>:8080/wall` öffnen (oder die normale Adresse – die App erkennt Tablets und fragt).
2. *Zum Startbildschirm hinzufügen* → startet als eigene Vollbild-App „Wand“.
3. ☰ → *Kindersicherung an*: Einstellungen sind dann ausgeblendet. Zum Entsperren die Uhr 3 Sekunden gedrückt halten.

Für Android-Tablets, die immer an der Wand hängen, ist **[Fully Kiosk Browser](https://www.fully-kiosk.com)** ideal:
Start-URL `…/wall`, *Bildschirm anlassen*, *Autostart nach Neustart*, optional Bildschirm nachts per Zeitplan aus.

Die Wand
- zeigt Uhr, Datum, Wetter (Ort in den Einstellungen wählen), eine Leiste „Heute“ (Anzahl Termine, Müllabfuhr, nächster Feiertag, „⏰ in 50 Min“),
- markiert laufende und nächste Termine und blendet vergangene aus,
- aktualisiert sich **sofort** per Live-Verbindung, wenn jemand am Handy etwas einträgt,
- dimmt nachts (Zeitraum einstellbar, Antippen weckt für 2 Minuten),
- verschiebt sich alle 10 Minuten um wenige Pixel (gegen Einbrennen) und lädt alle 12 Stunden neu,
- funktioniert hochkant und quer, hell und dunkel.

**Alte Geräte:** Läuft ab etwa Android 7 mit aktuellem Chrome/WebView bzw. iPad ab iOS 13.

## 5. Erinnerungen (ntfy)

1. App **ntfy** installieren ([Android](https://play.google.com/store/apps/details?id=io.heckel.ntfy) / [iPhone](https://apps.apple.com/app/ntfy/id1625396347)).
2. In der Familienwand: ⚙️ → *Erinnerungen* → Thema übernehmen (z. B. `familie-k3x9p2…`), Häkchen setzen, speichern, *Test senden*.
3. In der ntfy-App **dasselbe Thema abonnieren**.

Es kommen Erinnerungen X Minuten vorher („🧒 Kinderturnen – 16:30–17:30 · Noch 30 Minuten – genug Zeit, ganz entspannt.“)
und auf Wunsch eine **Morgen-Übersicht** zur gewählten Uhrzeit.

Eigenes Thema pro Person: in `data/db.json` bei der Person `"ntfyTopic": "…"` eintragen – dann gehen ihre Termine nur an sie.
Wer ntfy selbst hosten möchte: Server-Adresse in den Einstellungen ändern.

> Das Thema ist wie ein geheimer Kanalname: Wer es kennt, kann mitlesen. Deshalb ist es zufällig und lang.

## Einstellungen per Umgebungsvariable

| Variable | Standard | Bedeutung |
|---|---|---|
| `APP_PASSWORD` | leer | Familien-Passwort. Leer = keins (nur im Heimnetz!) |
| `PORT` | `8080` | Port im Container |
| `TZ` | `Europe/Berlin` | Zeitzone |
| `SYNC_MINUTES` | `3` | Abgleich mit Google/iCal |
| `DATA_DIR` | `/data` | Datenordner |
| `GOOGLE_SERVICE_ACCOUNT_FILE` | `/data/google-service-account.json` | Pfad zum Schlüssel |
| `PUID` / `PGID` | `1000` | Benutzer für den Datenordner |

## Entwicklung

```bash
npm run dev     # startet auf http://localhost:8080 mit ./data-dev
npm test        # Parser, iCal, Google (simuliert) und API
```

Keine Abhängigkeiten, nur Node.js ≥ 22. Aufbau:

```
server/
  index.js      HTTP-Server, API, Login, Live-Updates (Server-Sent Events)
  calendar.js   Termine lesen/schreiben/synchronisieren, Personen-Zuordnung
  google.js     Google Calendar API über Dienstkonto (JWT, ohne Bibliothek)
  ics.js        iCal-Leser mit Wiederholungen (RRULE, EXDATE, Ausnahmen)
  notify.js     ntfy-Erinnerungen und Morgen-Übersicht
  weather.js    Wetter über Open-Meteo (ohne API-Schlüssel)
  store.js      JSON-Speicher (atomisch)
  tz.js         Zeitzonen über Intl
public/
  index.html    eine Seite für Handy (/) und Wand (/wall)
  app.js        Oberfläche (ohne Build, läuft auch auf älteren Tablets)
  parse.js      versteht „Zahnarzt Mi 15 Uhr“
  sw.js         Offline-Modus
```

### Was wir aus Kinboard und momo übernommen haben

- **[Kinboard](https://github.com/svenger87/kinboard):** Personenfarben pro Kalender und Titel-Regeln („Mama: …“), Feiertags- und Müllkalender als eigene Art,
  „Heute“-Leiste auf der Wand, Tagesansicht beim Antippen, *Rückgängig* nach dem Löschen, Kiosk-/Kindersicherung, sofortige Aktualisierung aller Geräte.
  (Nur Ideen, kein Code – Kinboard steht unter einer nicht-kommerziellen Lizenz.)
- **[momo](https://github.com/jp1337/momo)** (MIT): ntfy-Versand als JSON (damit Umlaute und Emojis ankommen), Morgen-Übersicht, Service Worker mit sofortigem Update.

### Noch nicht drin (nächste Schritte)

- Wiederholungen für Termine, die direkt in der Familienwand angelegt werden (Google-Serien funktionieren bereits)
- Einkaufsliste und Tagesaufgaben zum Abhaken
- Der ADHS-Tagesbegleiter (siehe `../mockup/tagesfluss.html`) als zweite Ansicht, die diese Termine nutzt
