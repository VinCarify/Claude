# KM-Tracking

Passwortgeschütztes Dashboard für Auto-Abos: Kunden sehen ihren KM-Stand, ihr Paket und eine Prognose.
Statische Seite (`public/`) plus eine Netlify Function (`netlify/functions/data.mjs`), keine Dependencies.
Die Daten kommen aus dem veröffentlichten CSV des Sheet-Tabs `web` (Vorlage: `sheet/`).

## Lokal

```sh
npm test        # Unit-Tests der Function (node:test)
npm run e2e     # Playwright-Durchlauf mit Fake-Fixtures, Screenshots nach $SCREENSHOT_DIR
npm run dev     # http://127.0.0.1:8888 mit test/fixtures/web_sample_1.csv
```

`npm run dev` nutzt ohne `--password` ein lokales Demo-Passwort (steht im Log). Echte Daten nie ins Repo:
keine echten CSVs, keine `.env` (ist in `.gitignore`).

## Deploy auf Netlify – Checkliste

Das Repo ist **öffentlich**. Darum genau so einrichten:

1. **Production branch** = der Branch mit diesem Ordner (z. B. `main` nach dem Merge). Die Function liefert
   nur im Context «production» Daten, ein Branch Deploy bleibt leer.
2. **Base directory = `km-tracker`.** `netlify.toml`, `public/` und `netlify/functions/` liegen in diesem
   Unterordner. Ohne Base directory findet Netlify keine `netlify.toml`, publiziert das ganze Repo als
   statische Dateien, ohne Function und ohne Security-Header.
3. **Env vars** (Site configuration → Environment variables):

   | Variable             | Pflicht | Inhalt                                               |
   | -------------------- | ------- | ---------------------------------------------------- |
   | `SHEET_CSV_URL`      | ja      | Veröffentlichte CSV-URL des Tabs `web`               |
   | `DASHBOARD_PASSWORD` | ja      | Gemeinsames Passwort (frei wählbar)                  |
   | `DASHBOARD_TITLE`    | nein    | Titel im Header nach dem Login                       |
   | `CONTACT_EMAIL`      | nein    | Adresse für die «Schreib uns»-Links                  |

   - `SHEET_CSV_URL` und `DASHBOARD_PASSWORD` als **Secret** markieren und **nur für den Context
     «Production»** setzen, nicht für Deploy Previews oder Branch Deploys.
   - Die CSV-URL ist wie ein Schlüssel zu den Daten: nirgends posten, nicht ins Repo.
4. **Passwort:** frei wählbar, nur in Netlify setzen (nie ins Repo). Nach jeder Änderung neu deployen.
5. **Deploy Previews von Forks:** auf «Require approval» oder ganz aus stellen
   (Site configuration → Build & deploy → Deploy Previews). Ein Fork-PR kann `data.mjs` ändern.
   Die Function liefert ausserhalb von `production` (und `netlify dev`) zwar keine Daten, aber nur die
   Secret-Scopes oben schützen wirklich.
6. **Rate Limiting:** `data.mjs` setzt `config.rateLimit` (20 Requests pro Minute und IP, sonst 429).
   Prüfen, ob euer Netlify-Plan das unterstützt. Falls nicht: eine Rate-Limit-Regel im Netlify UI anlegen.

## Datenvertrag

Spalten und Regeln des Tabs `web` stehen in `netlify/functions/data.mjs` (`CONTRACT`). Nur diese Spalten
kommen durch die Function, alles andere wird verworfen. Zahlen und Daten sind Ganzzahlen
(Datum = Sheet-Seriennummer).

## Sheet-Vorlage bauen

```sh
python3 sheet/build_sheet.py --out km-tracker-template.xlsx --tariffs /pfad/zu/tariffs.json
python3 sheet/test_build_sheet.py   # braucht LibreOffice Calc, nutzt Fake-Tarife
```

Die Extra-KM-Tarife sind Firmendaten und **nicht** im Repo: entweder `--tariffs <datei>` oder eine
`sheet/tariffs.local.json` (ist in `.gitignore`). Format: siehe Kommentar in `build_sheet.py`,
Beispiel mit Fake-Werten: `sheet/fixtures/tariffs.fake.json`. Die `.xlsx` in Google Drive hochladen und
als Google Sheet öffnen, danach dem Tab «Anleitung» folgen.
