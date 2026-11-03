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

- **Gezählt wird nur, was nach der Freischaltung dazukommt.** Angezeigt wird
  Startwert (Stand bei Freischaltung, z. B. 380 / 685) + neu abgeschlossene Antworten.
  Beim ersten Lauf merkt sich das Skript die IDs aller bereits vorhandenen Antworten
  (`counter-api/.sync-state.json`); die werden nie mitgezählt. Der erste Lauf ändert die
  Zahlen also nicht. Gleiches gilt, wenn später eine weitere Umfrage-ID ergänzt wird.
- **Neue Erhebung** = neu *abgeschlossene* Antwort einer konfigurierten Umfrage, die FASQ-Items enthält.
  Antworten ohne Items (z. B. aus einer Weiterleitungs-Umfrage) werden nicht gezählt.
- **Neue Empfehlung** = Antwort mit Score ≥ 55, oder Score ≥ 45 bei Alter 2–5 Jahre.
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
   `LIMESURVEY_URL`, `LIMESURVEY_USER`, `LIMESURVEY_PASSWORD`, `LIMESURVEY_SURVEY_IDS`
   sowie die Startwerte `COUNTER_BASELINE_RECOMMENDATIONS` / `COUNTER_BASELINE_ASSESSMENTS`.
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
- **Werte manuell setzen** dient zur Korrektur: Die eingetragenen Zahlen gelten ab sofort,
  neue Antworten werden weiter dazugezählt (die Startwerte werden intern angepasst).
- **Neu beginnen** (z. B. falscher Startwert beim ersten Lauf): `.sync-state.json` löschen,
  Startwerte in der Config korrigieren, Abgleich erneut starten.
- Protokoll der letzten Läufe: `counter-api/.sync.log` (nicht öffentlich abrufbar).

## Schutzmechanismen

- Liefert eine Umfrage weniger Antworten als beim Start (Rechte entzogen, Antworten
  gelöscht), wird nichts geschrieben. Erzwingen: `--force`.
- Ein Lauf gleichzeitig (Lock-Datei); über HTTP höchstens ein Lauf pro Minute.
- GitHub bekommt nur dann einen Commit, wenn sich die Zahlen geändert haben.

## Optionen in `counter-config.php`

| Konstante | Bedeutung |
|---|---|
| `LIMESURVEY_SURVEY_IDS` | Liste der gezählten Umfragen: `[299374, 365113]` (deutsch + englisch). **Nicht** 655176 „– ALT“: die leitet nur alte Flyer-Links auf 299374 weiter und würde doppelt zählen. |
| `COUNTER_BASELINE_RECOMMENDATIONS`, `COUNTER_BASELINE_ASSESSMENTS` | Startwerte bei Freischaltung (nur beim ersten Lauf gelesen) |
| `COUNTER_SINCE` | Datum „Seit“ auf der Counter-Seite |
| `SYNC_KEY` | Schlüssel für externe Cron-Dienste |
| `COUNTER_ITEM_PATTERN`, `COUNTER_AGE_FIELD`, `COUNTER_EQUATION_FIELD` | Feldnamen, nur bei Umbau der Umfrage ändern |
