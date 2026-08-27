# FASQ.online Ergebnisseite

Eigenständige Ergebnisseite für den FASQ.online Fragebogen. Wird nach Absenden der LimeSurvey-Umfrage aufgerufen und zeigt das Ergebnis, eine Bewertung sowie Druck- und Versand-Optionen an.

## Features

- **Modernes, responsives UI** ohne Build-Step (Vanilla HTML/CSS/JS)
- **Automatische Bewertung** nach FASQ-Logik:
  - `score >= 55` ODER
  - `age zwischen 2 und 5 UND score >= 45`
- **Druckansicht** der gesamten Seite (PDF-Export)
- **E-Mail-Versand** an Nutzer:in und/oder Fachzentrum (mailto-Link)
- **Druckbares Empfehlungsschreiben** mit optionalem Namen der betroffenen Person
- **Kein Tracking, keine externen Abhängigkeiten** (außer Logo-Bildern von LimeSurvey)

## Lokal testen

```bash
cd result-page
python3 -m http.server 8000
```

Im Browser öffnen:

```
http://localhost:8000/?firstname=Max&lastname=Mustermann&email=max@example.com&age=4&score=58&plz=20095&group=Kind%20(2-5)&height=110&weight=18
```

## URL-Parameter

| Parameter   | Beschreibung      | LimeSurvey-Feld            |
| ----------- | ----------------- | -------------------------- |
| `score`     | Gesamtpunktzahl   | `ASSESSMENT_CURRENT_TOTAL` |
| `age`       | Alter in Jahren   | `G02Q02_SQ001`             |
| `firstname` | Vorname           | `TOKEN:FIRSTNAME`          |
| `lastname`  | Nachname          | `TOKEN:LASTNAME`           |
| `email`     | E-Mail            | `EMAILSELF.NAOK`           |
| `plz`       | Postleitzahl      | `G02Q06`                   |
| `group`     | Personengruppe    | `Q0.shown`                 |
| `height`    | Größe in cm       | `G02Q02_SQ003`             |
| `weight`    | Gewicht in kg     | `G02Q02_SQ002`             |

## LimeSurvey-Integration

In den Umfrageeinstellungen unter **Allgemeine Einstellungen → Endurl** eintragen (Produktiv-Deployment unter `https://fasd-fachzentrum.hamburg/fasq/`):

**WICHTIG:** Alle Frage-Platzhalter benötigen das Suffix `.NAOK` (Not Applicable OK). Ohne `.NAOK` lässt LimeSurvey Platzhalter von Fragen, die für die Person nicht relevant waren (z. B. KIDSI-Fragen bei Erwachsenen), unersetzt in der URL stehen – die Antwortübersicht zeigt dann fälschlich „0 Fragen beantwortet".

```
https://fasd-fachzentrum.hamburg/fasq/?score={ASSESSMENT_CURRENT_TOTAL}&age={G02Q02_SQ001.NAOK}&firstname={TOKEN:FIRSTNAME}&lastname={TOKEN:LASTNAME}&email={EMAILSELF.NAOK}&plz={G02Q06.NAOK}&group={Q0.shown}&height={G02Q02_SQ003.NAOK}&weight={G02Q02_SQ002.NAOK}&G01Q06={G01Q06.NAOK}&G01Q07={G01Q07.NAOK}&G01Q08={G01Q08.NAOK}&G01Q09={G01Q09.NAOK}&G01Q10={G01Q10.NAOK}&G01Q11={G01Q11.NAOK}&G01Q12={G01Q12.NAOK}&G01Q13={G01Q13.NAOK}&G01Q14={G01Q14.NAOK}&G01Q16={G01Q16.NAOK}&G01Q17={G01Q17.NAOK}&G01Q18={G01Q18.NAOK}&G01Q19={G01Q19.NAOK}&G01Q20={G01Q20.NAOK}&G01Q21={G01Q21.NAOK}&G01Q22={G01Q22.NAOK}&G01Q23={G01Q23.NAOK}&G01Q24={G01Q24.NAOK}&G01Q25={G01Q25.NAOK}&G01Q26={G01Q26.NAOK}&G01Q27={G01Q27.NAOK}&G01Q28={G01Q28.NAOK}&G01Q29={G01Q29.NAOK}&G01Q45={G01Q45.NAOK}&G01Q30={G01Q30.NAOK}&G01Q31={G01Q31.NAOK}&G01Q32={G01Q32.NAOK}&G01Q33={G01Q33.NAOK}&G01Q34={G01Q34.NAOK}&G01Q37={G01Q37.NAOK}&G01Q36={G01Q36.NAOK}&G01Q35={G01Q35.NAOK}&G01Q38={G01Q38.NAOK}&G01Q39={G01Q39.NAOK}&G01Q40={G01Q40.NAOK}&G01Q41={G01Q41.NAOK}&G01Q42={G01Q42.NAOK}&G01Q43={G01Q43.NAOK}&r953q0={r953q0.NAOK}&r904q0={r904q0.NAOK}&r1016q0={r1016q0.NAOK}&r1006q0={r1006q0.NAOK}&r765q0={r765q0.NAOK}&r439q0={r439q0.NAOK}&r702q0={r702q0.NAOK}&r560q0={r560q0.NAOK}&r912q0={r912q0.NAOK}&r604q0={r604q0.NAOK}&r753q0={r753q0.NAOK}&r979q0={r979q0.NAOK}&r84q0={r84q0.NAOK}&r660q0={r660q0.NAOK}&r226q0={r226q0.NAOK}&r753q1={r753q1.NAOK}&r16q0={r16q0.NAOK}&r989q0={r989q0.NAOK}&r69q0={r69q0.NAOK}&r668q0={r668q0.NAOK}&r789q0={r789q0.NAOK}&r658q0={r658q0.NAOK}&r263q0={r263q0.NAOK}&r719q0={r719q0.NAOK}&r754q0={r754q0.NAOK}&r222q0={r222q0.NAOK}&r744q0={r744q0.NAOK}&r180q0={r180q0.NAOK}&r543q0={r543q0.NAOK}&r138q0={r138q0.NAOK}&r620q0={r620q0.NAOK}&r363q0={r363q0.NAOK}&r358q0={r358q0.NAOK}&r214q0={r214q0.NAOK}&r716q0={r716q0.NAOK}&r229q0={r229q0.NAOK}&r29q0={r29q0.NAOK}&r708q0={r708q0.NAOK}
```

LimeSurvey ersetzt die Platzhalter automatisch. Zusätzlich **Automatisch nach Abschluss weiterleiten** aktivieren.

## Deployment

Vollständig statisch – deploybar auf jedem Webserver, Netlify, Vercel, GitHub Pages.

### Netlify Drop

Ordner `result-page/` auf [app.netlify.com/drop](https://app.netlify.com/drop) ziehen.

### Vercel

```bash
cd result-page
npx vercel --prod
```

## Anpassung

- **Fachzentrum-E-Mail**: In `app.js` Konstante `FACHZENTRUM_EMAIL`
- **Schwellenwerte**: In `app.js` Funktion `evaluateRecommendation`
- **Styling**: CSS-Variablen in `styles.css` (`:root`)
- **Empfehlungstext**: `<template id="empfehlung-template">` in `index.html`

## Dateien

```
result-page/
├── index.html
├── styles.css
├── app.js
└── README.md
```
