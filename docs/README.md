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

In den Umfrageeinstellungen unter **Allgemeine Einstellungen → Endurl** eintragen (Beispiel-Deployment unter `https://fasq-result.example.com`):

```
https://fasq-result.example.com/?score={ASSESSMENT_CURRENT_TOTAL}&age={G02Q02_SQ001}&firstname={TOKEN:FIRSTNAME}&lastname={TOKEN:LASTNAME}&email={EMAILSELF.NAOK}&plz={G02Q06}&group={Q0.shown}&height={G02Q02_SQ003}&weight={G02Q02_SQ002}
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
