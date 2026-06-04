# Counter aktualisieren

Die Live-Anzeige unter `https://oliviajools.github.io/FASDfragebogen/counter.html`
liest ihre Werte aus `docs/counter.json`.

## Monatlicher Update-Workflow

1. **In LimeSurvey einloggen** und zur Umfrage 738169 navigieren.

2. **Antworten exportieren oder Statistik öffnen**:
   - *Antworten → Statistik anzeigen* gibt einen Überblick.
   - Alternativ: *Antworten → Antworten anzeigen* und filtern nach Score.

3. **Werte ermitteln**:
   - `totalAssessments` = Gesamtanzahl abgeschlossener Fragebögen.
   - `totalRecommendations` = Anzahl der Fragebögen, bei denen der Score
     über dem altersabhängigen Schwellenwert liegt
     (= Empfehlung zur fachärztlichen Abklärung).

   Die Schwellenwerte sind in `docs/app.js` definiert (`evaluateRecommendation`):
   - Alter ≥ 6 Jahre, Kind/Jugendlicher: Score ≥ 50 → Empfehlung
   - Erwachsene: Score ≥ 50 → Empfehlung
   - Andere Logik je nach Personengruppe siehe Code

4. **`counter.json` editieren**:
   ```json
   {
     "totalRecommendations": 17,
     "totalAssessments": 42,
     "since": "2026-06-01",
     "lastUpdated": "2026-07-01"
   }
   ```
   - `lastUpdated` immer auf das heutige Datum setzen.
   - `since` bleibt unverändert (Startdatum des Fragebogens).

5. **Commit + Push**:
   ```bash
   git add docs/counter.json
   git commit -m "Counter update July 2026"
   git push
   ```

   Innerhalb von 1-2 Minuten ist die Aktualisierung live.

## Phase 2 (später, auf Hetzner)

Sobald auf Hetzner gehostet wird, kann ein PHP/Python-Script die Werte
direkt per LimeSurvey RemoteControl-API holen und `counter.json` automatisch
generieren (z. B. stündlich per Cron). Die Frontend-Logik bleibt identisch.
