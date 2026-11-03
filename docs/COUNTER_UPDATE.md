# Counter – automatischer Abgleich mit LimeSurvey

Die Counter-Seite (`counter.html`) zeigt, wie viele FASQ-Fragebögen abgeschlossen wurden
und wie viele davon eine Empfehlung zur FASD-Diagnostik ergeben haben. Die Zahlen kommen
automatisch aus LimeSurvey.

## So funktioniert es

```
LimeSurvey (RemoteControl-API)
        │  stündlich: sync_counter.php
        ▼
counter/counter.json auf fasd-fachzentrum.hamburg  ──►  counter.html (lädt alle 5 Min. neu)
        │  nur wenn sich die Zahlen ändern
        ▼
docs/counter.json im GitHub-Repo  ──►  oliviajools.github.io/…/counter.html, Fallback
```

- **Erhebungen** = alle *abgeschlossenen* Antworten der konfigurierten Umfragen.
- **Empfehlungen** = Antworten mit Score ≥ 55, oder Score ≥ 45 bei Alter 2–5 Jahre.
  Der Score ist die Summe der Antwortcodes (0–3) aller FASQ-Items (`G01Q…` im
  KIDS-I-Pfad, `r…q0` im ERW-I-Pfad). Das ist dieselbe Regel wie in der Gleichungsfrage
  `G05Q83` und in `docs/app.js`. Weicht `G05Q83` in einer Antwort ab, gilt der
  berechnete Score; der Abgleich meldet die Abweichung als Hinweis.
- Die Seite lädt `counter.json` alle 5 Minuten neu (nur wenn der Tab sichtbar ist).

## Einrichtung (einmalig)

1. **LimeSurvey:** Konfiguration → Globale Einstellungen → Schnittstellen →
   *RPC-Schnittstelle aktiviert* = **JSON-RPC**.
2. **API-Benutzer anlegen** (z. B. `counter-bot`) mit Recht *Antworten ansehen/exportieren*
   auf die FASQ-Umfragen (deutsch und ggf. englisch). Keine weiteren Rechte nötig.
3. **`counter-config.php` ergänzen** (Vorlage: `server/counter-config.example.php`):
   `LIMESURVEY_URL`, `LIMESURVEY_USER`, `LIMESURVEY_PASSWORD`, `LIMESURVEY_SURVEY_IDS`.
4. **Hochladen nach `/counter-api/`:** `counter-lib.php`, `sync_counter.php`,
   `update_counter.php`, `.htaccess`.
   **Nach `/counter/`:** `counter.js`, `admin.html`, `admin.js`.
5. **Testlauf** (rechnet nur, schreibt nichts):
   `php sync_counter.php --dry-run`
6. **Cronjob** im Hosting-Panel, stündlich:
   `php /pfad/zu/counter-api/sync_counter.php`

   Ohne Cron-Möglichkeit: in `counter-config.php` einen `SYNC_KEY` setzen
   (`openssl rand -hex 24`) und einen externen Dienst (z. B. cron-job.org) stündlich
   `https://fasd-fachzentrum.hamburg/counter-api/sync_counter.php?key=SYNC_KEY` aufrufen lassen.

## Im Alltag

- **admin.html** zeigt den letzten Abgleich. *Jetzt aus LimeSurvey abgleichen* löst sofort
  einen Lauf aus (Admin-Passwort nötig).
- **Werte manuell setzen** ist nur noch eine Notlösung; der nächste automatische Lauf
  überschreibt manuelle Werte.
- Protokoll der letzten Läufe: `counter-api/.sync.log` (nicht öffentlich abrufbar).

## Schutzmechanismen

- Liefert LimeSurvey plötzlich 0 Erhebungen, obwohl vorher Zahlen da waren (falsche
  Umfrage-ID, Rechte entzogen), wird nichts geschrieben. Erzwingen: `--force`.
- Ein Lauf gleichzeitig (Lock-Datei); über HTTP höchstens ein Lauf pro Minute.
- GitHub bekommt nur dann einen Commit, wenn sich die Zahlen geändert haben.

## Optionen in `counter-config.php`

| Konstante | Bedeutung |
|---|---|
| `LIMESURVEY_SURVEY_IDS` | Liste der gezählten Umfragen, z. B. `[655176]` |
| `COUNTER_COUNT_FROM` | Nur Abgaben ab diesem Datum zählen (`YYYY-MM-DD`), leer = alle |
| `COUNTER_SINCE` | Datum „Seit“ auf der Counter-Seite |
| `SYNC_KEY` | Schlüssel für externe Cron-Dienste |
| `COUNTER_ITEM_PATTERN`, `COUNTER_AGE_FIELD`, `COUNTER_EQUATION_FIELD` | Feldnamen, nur bei Umbau der Umfrage ändern |
