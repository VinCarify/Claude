# Offerten & Verträge

Erstellt Offerten und Auto-Abo-Verträge für Geschäftskunden im CARIFY-Design, als A4-PDF.
Statische Seite (`public/`), keine Dependencies, kein Server: alle Daten bleiben im Browser (localStorage).

Aufbau wie die bisherigen Dokumente:

| Dokument | Inhalt |
| --- | --- |
| **Offerte** | Deckblatt, Begleitbrief, «Warum ein Firmenwagen im Abo?», Preistabelle (Fahrzeug × Mindestlaufzeit × KM-Paket), optional Seite «Zusatzoptionen» |
| **Vertrag** | Auto-Abo Vertrag (1 Seite): Parteien, Fahrzeuge, Konditionen, Aborate, Unterschriften. Arten: *Neu*, *Anpassung* (neu ausgestellter Vertrag), *Übernahme* («Vertragsanpassung») |

Sprachen: Deutsch, Français, English.

## Bedienung

1. **Einstellungen importieren** (einmal pro Browser): Firmenadresse, Team, Texte, Logo, Fahrzeugkatalog.
   Die Datei liegt intern (z. B. Google Drive), **nie im Repo**. Ohne Import arbeitet die App mit neutralen Platzhaltertexten.
2. **Neu → Offerte**: Kunde, Fahrzeuge (aus dem Katalog oder neu), Preise erfassen. Preise lassen sich aus
   Excel/Google Sheets in die Preistabelle einfügen. Die Checkliste oben zeigt, was noch fehlt.
3. **PDF erstellen** → im Druckdialog «Als PDF speichern». Der Dateiname ist schon gesetzt
   (`Offerte Nachname (Firma).pdf`, `CARIFY Vertrag - Firma.pdf`).
4. **Vertrag erstellen** (bei der Offerte): gewählte Variante anklicken – Kunde, Fahrzeug, KM-Package,
   Laufzeit und Aborate werden übernommen. Vertragsnummer und Abobeginn ergänzen.
5. **E-Mail-Text**: Vorlage «Offerte senden», «Nachfassen» oder «Vertrag senden» kopieren oder im Mailprogramm öffnen.

Entwürfe werden automatisch gespeichert (Entwürfe → öffnen, duplizieren, löschen, Backup).

## Lokal

```sh
npm test        # Unit-Tests (node:test)
npm run e2e     # Playwright-Durchlauf mit Fake-Daten, Screenshots + PDFs nach $SCREENSHOT_DIR
npm run dev     # http://127.0.0.1:8899
```

`public/index.html` funktioniert auch direkt per Doppelklick (file://), ohne Server.

## Deploy auf Netlify

Eigene Netlify-Site für diesen Ordner:

1. **Base directory = `offerten`** (hier liegt `netlify.toml`, Publish = `public`).
2. Keine Env vars nötig: Die Seite enthält keine Firmen- oder Kundendaten. Die kommen erst im Browser per Import dazu.
3. Optional Zugriffsschutz (Netlify Password Protection / Team-Login), damit die App nicht öffentlich auffindbar ist.
   `robots.txt` und `X-Robots-Tag` verhindern die Indexierung bereits.

## Daten & Datenschutz

Das Repo ist **öffentlich**. Darum:

- Keine echten Kundendaten, Preise, Adressen, Vertragstexte oder Logos im Code. Tests nutzen nur
  `test/fixtures/settings.fake.json` (fiktiv).
- Firmendaten stehen in der Einstellungs-Datei (`carify-einstellungen*.json`, `*.local.json` sind in `.gitignore`).
- Die App sendet nichts ins Internet (CSP `default-src 'self'`, Schrift Inter lokal unter `public/fonts/`, SIL OFL).

## Einstellungs-Datei

JSON mit `"schema": "carify-offerten/1"`. Fehlende Felder werden mit Standardwerten ergänzt.

| Feld | Inhalt |
| --- | --- |
| `company` | Name, rechtlicher Name, Adresse (für den Vertrag) |
| `team[]` | `name`, `role`, `phone`, `email` – Absender im Begleitbrief |
| `defaults` | KM-Pakete, Laufzeiten, MwSt-Satz, Gültigkeit, Mehrkilometer, Kündigungsfrist, Insurance-Packages, Package Types |
| `branding` | `logo`, `coverImage`, `whyImage` (Data-URLs), `references[]`, `badges[]` |
| `catalog[]` | Fahrzeuge mit Preismatrix (`kms`, `rows[{months, prices, insurance}]`) |
| `texts.de/fr/en` | Alle Texte. Platzhalter `{{…}}`, `**fett**`, Leerzeile = Absatz, `• ` = Aufzählung |

Alles lässt sich auch in der App unter **Einstellungen** bearbeiten und wieder exportieren.

## Code

| Datei | Aufgabe |
| --- | --- |
| `public/lib/format.js` | CHF-, Zahlen- und Datumsformat (de-CH, fr-CH) |
| `public/lib/defaults.js` | Neutrale Standard-Einstellungen und Texte |
| `public/lib/model.js` | Datenmodell, abgeleitete Werte, Validierung, Dateiname, E-Mail-Text |
| `public/lib/render.js` | A4-Seiten mit automatischem Seitenumbruch |
| `public/document.css` | Dokument-Design (Bildschirm und Druck) |
| `public/app.js`, `styles.css` | Editor, Vorschau, Dialoge |
